const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

// Initialize database
require('./database');

const authRoutes = require('./routes/auth');
const accountsRoutes = require('./routes/accounts');
const invoicesRoutes = require('./routes/invoices');
const alertsRoutes = require('./routes/alerts');
const progressTracker = require('./services/progressTracker');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../public')));

// Progress tracker endpoint
app.get('/api/progress', (req, res) => {
  res.json(progressTracker.getState());
});

// API Routes
app.use('/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/alerts', alertsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start server if executed directly
if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Gestor de Facturas Gmail activo en:`);
    console.log(`👉 http://localhost:${config.PORT}`);
    console.log(`======================================================\n`);
  });
}

module.exports = app;
