const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../database');
const gmailService = require('./gmailService');
const { extractInvoiceData } = require('./invoiceExtractor');
const { detectInvoicePortalLinks } = require('./linkDetector');
const progressTracker = require('./progressTracker');

/**
 * Synchronizes emails from a connected Gmail account, processes invoice attachments
 * and raises alerts for emails containing portal links without direct attachments.
 * 
 * @param {number} accountId 
 * @param {object} options 
 * @returns {Promise<{ newInvoices: number, newAlerts: number, rejectedNonInvoices: number, errors: Array }>}
 */
async function syncAccount(accountId, options = {}) {
  const account = db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
  if (!account) {
    throw new Error(`Cuenta con ID ${accountId} no encontrada`);
  }

  const authClient = gmailService.getClientForAccount(account);

  progressTracker.start(`Buscando correos de facturas en ${account.email}...`, 100);

  const searchQuery = options.query || 
    '(factura OR invoice OR bill OR recibo OR albarán OR "área de clientes" OR "portal de clientes" OR "descargar factura")';

  const messages = await gmailService.searchMessages(authClient, searchQuery, options.maxResults || 40);

  progressTracker.update({ 
    total: messages.length, 
    current: 0, 
    step: `Encontrados ${messages.length} correos. Procesando adjuntos y enlaces...` 
  });

  let newInvoices = 0;
  let newAlerts = 0;
  let rejectedNonInvoices = 0;
  const errors = [];

  const yearStr = new Date().getFullYear().toString();
  const accountStorageDir = path.join(config.STORAGE_DIR, `account_${account.id}`, yearStr);
  if (!fs.existsSync(accountStorageDir)) {
    fs.mkdirSync(accountStorageDir, { recursive: true });
  }

  const userMeta = {
    name: account.name || 'Adrián Gutiérrez',
    email: account.email
  };

  for (let i = 0; i < messages.length; i++) {
    const msgRef = messages[i];
    try {
      const messageId = msgRef.id;

      progressTracker.update({
        current: i + 1,
        total: messages.length,
        step: `Analizando correo ${i + 1} de ${messages.length}...`
      });

      const existingInvoice = db.get('SELECT id FROM invoices WHERE message_id = ? AND account_id = ?', [messageId, accountId]);
      const existingAlert = db.get('SELECT id FROM alerts WHERE message_id = ? AND account_id = ?', [messageId, accountId]);

      if (existingInvoice && existingAlert) {
        continue;
      }

      const msgDetails = await gmailService.getMessageDetails(authClient, messageId);

      // Process direct attachments
      if (msgDetails.attachments && msgDetails.attachments.length > 0 && !existingInvoice) {
        for (const att of msgDetails.attachments) {
          progressTracker.update({
            step: `Extrayendo con IA: ${att.filename.slice(0, 35)}...`
          });

          const buffer = await gmailService.downloadAttachment(authClient, messageId, att.attachmentId);

          const safeFilename = `${Date.now()}_${att.filename.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
          const filePath = path.join(accountStorageDir, safeFilename);

          fs.writeFileSync(filePath, buffer);

          // Extract and validate with Gemini
          const extracted = await extractInvoiceData(filePath, att.mimeType, {
            sender: msgDetails.sender,
            subject: msgDetails.subject,
            date: msgDetails.date
          }, userMeta);

          // If document is determined NOT to be a valid invoice (e.g. tax model 303/390, traffic fine, etc.)
          if (extracted.is_valid_invoice === false) {
            console.log(`Documento descartado (${extracted.rejection_reason}): ${att.filename}`);
            try {
              if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (e) {}
            rejectedNonInvoices++;
            continue;
          }

          // Insert valid invoice into database
          db.run(
            `INSERT INTO invoices (
              account_id, message_id, filename, filepath, filesize,
              email_subject, sender, email_date,
              supplier_name, supplier_vat_id, invoice_number, invoice_date,
              invoice_type, base_amount, tax_rate, tax_amount, total_amount, currency,
              confidence_score, raw_ai_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              accountId,
              messageId,
              att.filename,
              filePath,
              att.size || buffer.length,
              msgDetails.subject,
              msgDetails.sender,
              msgDetails.date,
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
              extracted.raw_ai_json
            ]
          );

          newInvoices++;
        }
      }

      // Check for external portal links
      if (!existingAlert) {
        const portalLinks = detectInvoicePortalLinks(msgDetails.bodyHtml, msgDetails.bodyText);

        if (portalLinks.length > 0) {
          for (const link of portalLinks) {
            db.run(
              `INSERT INTO alerts (
                account_id, message_id, email_subject, sender, email_date,
                portal_url, link_text, context_snippet, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
              [
                accountId,
                messageId,
                msgDetails.subject,
                msgDetails.sender,
                msgDetails.date,
                link.portalUrl,
                link.linkText,
                link.contextSnippet
              ]
            );
            newAlerts++;
          }
        }
      }

    } catch (err) {
      console.error(`Error processing message ${msgRef.id}:`, err.message);
      errors.push({ messageId: msgRef.id, error: err.message });
    }
  }

  // Update account last_synced_at timestamp
  db.run('UPDATE accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?', [accountId]);

  progressTracker.finish(`Sincronización completada: ${newInvoices} facturas añadidas, ${rejectedNonInvoices} no facturas descartadas.`);

  return {
    accountId,
    accountEmail: account.email,
    newInvoices,
    newAlerts,
    rejectedNonInvoices,
    errors
  };
}

module.exports = {
  syncAccount
};
