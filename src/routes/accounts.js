const express = require('express');
const router = express.Router();
const db = require('../database');
const { syncAccount } = require('../services/syncService');

// Get all connected accounts with stats
router.get('/', (req, res) => {
  try {
    const accounts = db.all(`
      SELECT 
        a.id, 
        a.email, 
        a.name,
        a.picture,
        a.created_at, 
        a.last_synced_at,
        COUNT(DISTINCT i.id) as invoice_count,
        COUNT(DISTINCT al.id) as alert_count
      FROM accounts a
      LEFT JOIN invoices i ON a.id = i.account_id
      LEFT JOIN alerts al ON a.id = al.account_id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger synchronization for an account (asynchronous to avoid proxy timeouts)
router.post('/:id/sync', async (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  try {
    const account = db.get('SELECT email FROM accounts WHERE id = ?', [accountId]);
    if (!account) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }

    // Launch synchronization in background
    syncAccount(accountId, req.body || {}).catch((err) => {
      console.error('Error in background sync:', err);
    });

    // Respond immediately so Railway proxy never times out (60s limit)
    res.json({
      success: true,
      started: true,
      message: `Sincronización iniciada en segundo plano para ${account.email}`
    });
  } catch (err) {
    console.error('Error starting account sync:', err);
    res.status(500).json({ error: err.message });
  }
});

// Disconnect/delete an account
router.delete('/:id', (req, res) => {
  const accountId = parseInt(req.params.id, 10);
  try {
    db.run('DELETE FROM alerts WHERE account_id = ?', [accountId]);
    db.run('DELETE FROM invoices WHERE account_id = ?', [accountId]);
    db.run('DELETE FROM accounts WHERE id = ?', [accountId]);
    res.json({ success: true, message: 'Cuenta desconectada exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
