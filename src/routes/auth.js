const express = require('express');
const router = express.Router();
const gmailService = require('../services/gmailService');
const db = require('../database');

router.get('/google/login', (req, res) => {
  try {
    const authUrl = gmailService.getAuthUrl();
    res.redirect(authUrl);
  } catch (err) {
    res.status(500).send(`Error iniciando autenticación con Google: ${err.message}. Verifica que hayas configurado GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el archivo .env`);
  }
});

router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect('/?error=No_code_provided');
  }

  try {
    const { email, name, picture, tokens } = await gmailService.getTokensFromCode(code);

    // Save or update account in SQLite
    const existing = db.get('SELECT id FROM accounts WHERE email = ?', [email]);
    if (existing) {
      db.run(
        `UPDATE accounts 
         SET access_token = ?, 
             refresh_token = COALESCE(?, refresh_token), 
             token_expiry = ?,
             name = COALESCE(?, name),
             picture = COALESCE(?, picture)
         WHERE id = ?`,
        [tokens.access_token, tokens.refresh_token || null, tokens.expiry_date, name, picture, existing.id]
      );
    } else {
      db.run(
        `INSERT INTO accounts (email, name, picture, access_token, refresh_token, token_expiry) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [email, name, picture, tokens.access_token, tokens.refresh_token, tokens.expiry_date]
      );
    }

    res.redirect(`/?connected=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error('Error in OAuth callback:', err);
    res.redirect(`/?error=${encodeURIComponent(err.message)}`);
  }
});

module.exports = router;
