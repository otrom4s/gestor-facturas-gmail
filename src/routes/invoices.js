const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');
const db = require('../database');
const { extractInvoiceData } = require('../services/invoiceExtractor');
const progressTracker = require('../services/progressTracker');

// Build query filter conditions
function buildFilterConditions(query) {
  const conditions = [];
  const params = [];

  if (query.account_id) {
    conditions.push('account_id = ?');
    params.push(parseInt(query.account_id, 10));
  }

  if (query.type) {
    conditions.push('invoice_type = ?');
    params.push(query.type);
  }

  if (query.search) {
    conditions.push('(supplier_name LIKE ? OR supplier_vat_id LIKE ? OR invoice_number LIKE ? OR email_subject LIKE ?)');
    const searchTerm = `%${query.search.trim()}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (query.date_from) {
    conditions.push('invoice_date >= ?');
    params.push(query.date_from);
  }

  if (query.date_to) {
    conditions.push('invoice_date <= ?');
    params.push(query.date_to);
  }

  if (query.year) {
    const year = query.year;
    if (query.quarter) {
      const q = parseInt(query.quarter, 10);
      const ranges = {
        1: [`${year}-01-01`, `${year}-03-31`],
        2: [`${year}-04-01`, `${year}-06-30`],
        3: [`${year}-07-01`, `${year}-09-30`],
        4: [`${year}-10-01`, `${year}-12-31`]
      };
      if (ranges[q]) {
        conditions.push('invoice_date >= ? AND invoice_date <= ?');
        params.push(ranges[q][0], ranges[q][1]);
      }
    } else {
      conditions.push('invoice_date LIKE ?');
      params.push(`${year}%`);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

// GET list of invoices with filters
router.get('/', (req, res) => {
  try {
    const { whereClause, params } = buildFilterConditions(req.query);
    const sql = `
      SELECT * FROM invoices 
      ${whereClause} 
      ORDER BY invoice_date DESC, id DESC
    `;
    const invoices = db.all(sql, params);
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET financial metrics / stats
router.get('/stats', (req, res) => {
  try {
    const { whereClause, params } = buildFilterConditions(req.query);
    const totals = db.get(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN invoice_type = 'ingreso' THEN total_amount ELSE 0 END), 0) as total_ingresos,
        COALESCE(SUM(CASE WHEN invoice_type = 'gasto' OR invoice_type IS NULL THEN total_amount ELSE 0 END), 0) as total_gastos,
        COALESCE(SUM(CASE WHEN invoice_type = 'gasto' OR invoice_type IS NULL THEN base_amount ELSE 0 END), 0) as base_gastos,
        COALESCE(SUM(CASE WHEN invoice_type = 'ingreso' THEN base_amount ELSE 0 END), 0) as base_ingresos,
        COALESCE(SUM(CASE WHEN invoice_type = 'gasto' OR invoice_type IS NULL THEN tax_amount ELSE 0 END), 0) as iva_soportado,
        COALESCE(SUM(CASE WHEN invoice_type = 'ingreso' THEN tax_amount ELSE 0 END), 0) as iva_repercutido,
        COALESCE(SUM(total_amount), 0) as grand_total
      FROM invoices
      ${whereClause}
    `, params);

    const bySupplier = db.all(`
      SELECT 
        supplier_name,
        invoice_type,
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM invoices
      ${whereClause}
      GROUP BY supplier_name
      ORDER BY total DESC
      LIMIT 10
    `, params);

    res.json({ totals, bySupplier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle invoice type between 'gasto' and 'ingreso'
router.patch('/:id/toggle-type', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const invoice = db.get('SELECT id, invoice_type FROM invoices WHERE id = ?', [id]);
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

    const newType = invoice.invoice_type === 'ingreso' ? 'gasto' : 'ingreso';
    db.run('UPDATE invoices SET invoice_type = ? WHERE id = ?', [newType, id]);

    res.json({ success: true, newType, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete invoice
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const invoice = db.get('SELECT filepath FROM invoices WHERE id = ?', [id]);
    if (invoice && fs.existsSync(invoice.filepath)) {
      try { fs.unlinkSync(invoice.filepath); } catch (e) {}
    }
    db.run('DELETE FROM invoices WHERE id = ?', [id]);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Re-analyze invoices with AI with real-time progress tracking
router.post('/reanalyze', async (req, res) => {
  try {
    const forceAll = req.body && req.body.forceAll === true;
    const sql = forceAll 
      ? 'SELECT i.*, a.name as account_name, a.email as account_email FROM invoices i JOIN accounts a ON i.account_id = a.id' 
      : "SELECT i.*, a.name as account_name, a.email as account_email FROM invoices i JOIN accounts a ON i.account_id = a.id WHERE i.total_amount = 0 OR i.raw_ai_json LIKE '%Fallback%'";
    const invoices = db.all(sql);

    progressTracker.start('Analizando facturas con Gemini AI...', invoices.length);

    let updated = 0;
    let deletedNonInvoices = 0;
    const errors = [];

    // Run processing asynchronously so HTTP response can return or progress can be polled
    (async () => {
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        progressTracker.update({
          current: i + 1,
          total: invoices.length,
          step: `Analizando ${i + 1} de ${invoices.length}: ${inv.filename.slice(0, 30)}...`
        });

        if (!fs.existsSync(inv.filepath)) continue;

        try {
          const mimeType = inv.filename.endsWith('.png') ? 'image/png' 
            : (inv.filename.endsWith('.jpg') || inv.filename.endsWith('.jpeg')) ? 'image/jpeg' 
            : 'application/pdf';

          const userMeta = {
            name: inv.account_name || 'Adrián Gutiérrez',
            email: inv.account_email
          };

          const extracted = await extractInvoiceData(inv.filepath, mimeType, {
            sender: inv.sender,
            subject: inv.email_subject,
            date: inv.email_date
          }, userMeta);

          // If document is not a valid invoice (e.g. tax model or fine), remove it!
          if (extracted.is_valid_invoice === false) {
            console.log(`Eliminando no-factura detectada por IA (${extracted.rejection_reason}): ${inv.filename}`);
            try { if (fs.existsSync(inv.filepath)) fs.unlinkSync(inv.filepath); } catch (e) {}
            db.run('DELETE FROM invoices WHERE id = ?', [inv.id]);
            deletedNonInvoices++;
            continue;
          }

          db.run(`
            UPDATE invoices SET
              supplier_name = ?,
              supplier_vat_id = ?,
              invoice_number = ?,
              invoice_date = ?,
              invoice_type = ?,
              base_amount = ?,
              tax_rate = ?,
              tax_amount = ?,
              total_amount = ?,
              currency = ?,
              confidence_score = ?,
              raw_ai_json = ?
            WHERE id = ?
          `, [
            extracted.supplier_name,
            extracted.supplier_vat_id,
            extracted.invoice_number,
            extracted.invoice_date,
            extracted.invoice_type || 'gasto',
            extracted.base_amount,
            extracted.tax_rate,
            extracted.tax_amount,
            extracted.total_amount,
            extracted.currency,
            extracted.confidence_score,
            extracted.raw_ai_json,
            inv.id
          ]);

          updated++;
        } catch (err) {
          console.error(`Error reanalyzing invoice ${inv.id}:`, err.message);
          errors.push({ id: inv.id, error: err.message });
        }
      }

      progressTracker.finish(`Análisis completado: ${updated} facturas actualizadas, ${deletedNonInvoices} no-facturas eliminadas.`);
    })().catch(console.error);

    res.json({ success: true, started: true, total: invoices.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download a single invoice PDF using direct streaming
router.get('/:id/download', (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const invoice = db.get('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!invoice) {
      return res.status(404).send('Factura no encontrada');
    }

    if (!fs.existsSync(invoice.filepath)) {
      return res.status(404).send('El archivo de la factura no existe en el disco');
    }

    const cleanSupplier = (invoice.supplier_name || 'Factura').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanNum = (invoice.invoice_number || invoice.id).toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    const downloadName = `${invoice.invoice_date || 'fecha'}_${cleanSupplier}_${cleanNum}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);

    const stream = fs.createReadStream(invoice.filepath);
    stream.on('error', (err) => {
      console.error('File stream error:', err);
      if (!res.headersSent) res.status(500).send('Error leyendo archivo');
    });
    stream.pipe(res);
  } catch (err) {
    res.status(500).send(`Error al descargar factura: ${err.message}`);
  }
});

// Batch download as ZIP (e.g. for Gestoría / Trimestre)
router.get('/export/zip', (req, res) => {
  try {
    const { whereClause, params } = buildFilterConditions(req.query);
    const invoices = db.all(`SELECT * FROM invoices ${whereClause} ORDER BY invoice_date ASC`, params);

    if (invoices.length === 0) {
      return res.status(400).send('No hay facturas con los filtros seleccionados para descargar');
    }

    const archive = new ZipArchive({ zlib: { level: 9 } });
    const zipName = `Facturas_${req.query.quarter ? `T${req.query.quarter}_` : ''}${req.query.year || 'todas'}_${Date.now()}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) res.status(500).send(err.message);
    });

    archive.pipe(res);

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      if (fs.existsSync(inv.filepath)) {
        const cleanSupplier = (inv.supplier_name || 'Proveedor').replace(/[^a-zA-Z0-9_-]/g, '_');
        const cleanNum = (inv.invoice_number || inv.id).toString().replace(/[^a-zA-Z0-9_-]/g, '_');
        const typePrefix = inv.invoice_type === 'ingreso' ? 'INGRESO' : 'GASTO';
        const internalName = `${inv.invoice_date || '0000-00-00'}_${typePrefix}_${cleanSupplier}_${cleanNum}_${inv.total_amount}${inv.currency || 'EUR'}.pdf`;
        archive.file(inv.filepath, { name: internalName });
      }
    }

    archive.finalize();
  } catch (err) {
    console.error('Error generating zip:', err);
    res.status(500).send(`Error generando archivo ZIP: ${err.message}`);
  }
});

// Export to CSV for Excel / Accounting
router.get('/export/csv', (req, res) => {
  try {
    const { whereClause, params } = buildFilterConditions(req.query);
    const invoices = db.all(`SELECT * FROM invoices ${whereClause} ORDER BY invoice_date ASC`, params);

    const headers = [
      'ID',
      'Tipo',
      'Fecha Factura',
      'Proveedor / Cliente',
      'CIF / NIF',
      'Nº Factura',
      'Base Imponible (€)',
      '% IVA',
      'Cuota IVA (€)',
      'Total (€)',
      'Moneda',
      'Asunto Correo',
      'Remitente'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = invoices.map(inv => [
      inv.id,
      inv.invoice_type === 'ingreso' ? 'Ingreso' : 'Gasto',
      inv.invoice_date || '',
      escapeCsv(inv.supplier_name),
      escapeCsv(inv.supplier_vat_id),
      escapeCsv(inv.invoice_number),
      (inv.base_amount || 0).toFixed(2).replace('.', ','),
      (inv.tax_rate || 0).toFixed(1).replace('.', ','),
      (inv.tax_amount || 0).toFixed(2).replace('.', ','),
      (inv.total_amount || 0).toFixed(2).replace('.', ','),
      inv.currency || 'EUR',
      escapeCsv(inv.email_subject),
      escapeCsv(inv.sender)
    ].join(';'));

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Libro_Facturas_${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send(`Error generando CSV: ${err.message}`);
  }
});

module.exports = router;
