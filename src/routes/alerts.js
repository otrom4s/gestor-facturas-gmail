const express = require('express');
const router = express.Router();
const db = require('../database');

// GET all alerts (optionally filtered by account or status)
router.get('/', (req, res) => {
  try {
    const conditions = [];
    const params = [];

    if (req.query.account_id) {
      conditions.push('al.account_id = ?');
      params.push(parseInt(req.query.account_id, 10));
    }

    if (req.query.status) {
      conditions.push('al.status = ?');
      params.push(req.query.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT 
        al.*,
        a.email as account_email
      FROM alerts al
      JOIN accounts a ON al.account_id = a.id
      ${whereClause}
      ORDER BY al.created_at DESC
    `;

    const alerts = db.all(sql, params);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark alert as resolved
router.patch('/:id/resolve', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    db.run("UPDATE alerts SET status = 'resolved' WHERE id = ?", [id]);
    res.json({ success: true, message: 'Alerta marcada como resuelta' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete alert
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    db.run('DELETE FROM alerts WHERE id = ?', [id]);
    res.json({ success: true, message: 'Alerta eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
