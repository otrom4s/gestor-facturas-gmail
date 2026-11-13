const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

module.exports = {
  PORT: process.env.PORT || 3000,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(__dirname, '../storage/invoices'),
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '../data'),
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '../data/facturas.db')
};
