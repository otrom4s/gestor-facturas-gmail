const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Ensure directories exist
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}
if (!fs.existsSync(config.STORAGE_DIR)) {
  fs.mkdirSync(config.STORAGE_DIR, { recursive: true });
}

const db = new DatabaseSync(config.DB_PATH);

// WAL mode for fast concurrent operations
db.exec('PRAGMA journal_mode = WAL;');

// Schema definition
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_synced_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    message_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    filesize INTEGER DEFAULT 0,
    email_subject TEXT,
    sender TEXT,
    email_date TEXT,
    supplier_name TEXT,
    supplier_vat_id TEXT,
    invoice_number TEXT,
    invoice_date TEXT,
    invoice_type TEXT DEFAULT 'gasto',
    base_amount REAL DEFAULT 0,
    tax_rate REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    currency TEXT DEFAULT 'EUR',
    confidence_score REAL DEFAULT 1.0,
    raw_ai_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    message_id TEXT NOT NULL,
    email_subject TEXT,
    sender TEXT,
    email_date TEXT,
    portal_url TEXT NOT NULL,
    link_text TEXT,
    context_snippet TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES accounts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_msg ON invoices(message_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_account ON alerts(account_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_msg ON alerts(message_id);
`);

// Safe migrations for existing databases
try {
  db.exec('ALTER TABLE accounts ADD COLUMN name TEXT;');
} catch (e) {}
try {
  db.exec('ALTER TABLE accounts ADD COLUMN picture TEXT;');
} catch (e) {}
try {
  db.exec("ALTER TABLE invoices ADD COLUMN invoice_type TEXT DEFAULT 'gasto';");
} catch (e) {}

// Helper wrapper functions
module.exports = {
  db,
  all(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  },
  get(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  },
  run(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  },
  exec(sql) {
    return db.exec(sql);
  }
};
