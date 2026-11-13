const fs = require('fs');
const path = require('path');
const config = require('../config');

let GoogleGenAI = null;
try {
  ({ GoogleGenAI } = require('@google/genai'));
} catch (e) {
  console.warn('[@google/genai] not loaded:', e.message);
}

function buildExtractionPrompt(userMeta = {}) {
  const userName = userMeta.name || 'Adrián Gutiérrez';
  const userEmail = userMeta.email || '';

  return `
Eres un auditor tributario y experto contable. Analiza exhaustivamente el documento adjunto y responde EXCLUSIVAMENTE con un objeto JSON válido con esta estructura:
{
  "is_valid_invoice": true,
  "document_type": "factura",
  "rejection_reason": null,
  "invoice_type": "gasto",
  "supplier_name": "Nombre de la empresa proveedora o del cliente",
  "supplier_vat_id": "CIF, NIF o VAT ID de la contraparte",
  "invoice_number": "Número o serie del documento",
  "invoice_date": "YYYY-MM-DD",
  "base_amount": 0.00,
  "tax_rate": 21.0,
  "tax_amount": 0.00,
  "total_amount": 0.00,
  "currency": "EUR",
  "confidence_score": 0.95
}

--- REGLAS CRÍTICAS DE VALIDACIÓN (is_valid_invoice) ---
1. DEBE SER false SI EL DOCUMENTO ES:
   - Un billete de avión, billete de tren, autobús, tarjeta de embarque, pasaje o boleto de viaje (ej: PeruRail, Renfe, Vueling, Iberia, Ryanair, Air Europa, etc.).
   - Una reserva de hotel, alojamiento o viaje (Booking, Airbnb, etc.) que no sea una factura comercial con NIF y desglose de IVA.
   - Un modelo tributario oficial o declaración de impuestos (ej: Modelos 303, 390, 111, 115, 130, 200, IRPF, etc.).
   - Una multa, sanción de tráfico (DGT) o notificación administrativa.
   - Un certificado bancario (titularidad), empadronamiento, DNI, pasaporte, informe médico/laboral o nómina.
   - Una presentación comercial, infografía o imagen decorativa.
   En estos casos, pon: "is_valid_invoice": false, "document_type": "billete_viaje" | "modelo_tributario" | "multa" | "certificado" | "otro", "rejection_reason": "Motivo específico".

2. DEBE SER true ÚNICAMENTE SI:
   - Es una FACTURA comercial (ordinaria, simplificada/ticket, rectificativa o proforma) con desglose de servicios/productos, importes e impuestos.

--- REGLAS CRÍTICAS DE CLASIFICACIÓN (invoice_type: "gasto" vs "ingreso") ---
El titular del buzón de correo es: "${userName}" (email: "${userEmail}").
- "ingreso": El titular ("${userName}") es quien EMITE la factura a su cliente para cobrar por sus servicios profesionales, consultoría o productos. (Él es el Emisor/Vendedor). En este caso, en "supplier_name" pon el nombre del CLIENTE receptor de la factura.
- "gasto": El titular ("${userName}") es el CLIENTE / DESTINATARIO que compra o paga la factura emitida por un tercero/proveedor (ej: suministros, gestoría Menfis Grup, Glovo, Vodafone, Amazon, etc.). En este caso, en "supplier_name" pon el nombre del PROVEEDOR.

--- IMPORTES ---
- base_amount: Base imponible neta antes de impuestos.
- tax_rate: Porcentaje de IVA predominante (21, 10, 4, 0).
- tax_amount: Cuota total de IVA / impuestos.
- total_amount: Total final del documento.
- Formato de fecha siempre YYYY-MM-DD.
`;
}

/**
 * Extracts structured accounting data from an invoice file (PDF or image).
 * 
 * @param {string} filePath - Absolute path to the PDF or image file
 * @param {string} mimeType - e.g. 'application/pdf', 'image/jpeg', 'image/png'
 * @param {object} emailMeta - Optional metadata from the email (subject, sender, date)
 * @param {object} userMeta - Context about the account owner (name, email)
 * @returns {Promise<object>}
 */
async function extractInvoiceData(filePath, mimeType = 'application/pdf', emailMeta = {}, userMeta = {}) {
  if (config.GEMINI_API_KEY && GoogleGenAI) {
    const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    const prompt = buildExtractionPrompt(userMeta);

    for (const modelName of candidateModels) {
      try {
        const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');

        let resolvedMime = mimeType;
        if (filePath.endsWith('.pdf')) resolvedMime = 'application/pdf';
        else if (filePath.endsWith('.png')) resolvedMime = 'image/png';
        else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) resolvedMime = 'image/jpeg';

        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              inlineData: {
                mimeType: resolvedMime,
                data: base64Data
              }
            },
            prompt
          ],
          config: {
            responseMimeType: 'application/json'
          }
        });

        const responseText = response.text || '';
        const cleanedJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanedJson);

        // If explicitly classified as NOT a valid invoice, reject it
        if (parsed.is_valid_invoice === false) {
          return {
            is_valid_invoice: false,
            document_type: parsed.document_type || 'otro',
            rejection_reason: parsed.rejection_reason || 'Documento no reconocido como factura comercial'
          };
        }

        // Determine type: if subject mentions "factura ingresos" or user is issuer -> ingreso
        let resolvedType = (parsed.invoice_type || 'gasto').toLowerCase();
        if (emailMeta.subject && /factura\s+ingresos/i.test(emailMeta.subject)) {
          resolvedType = 'ingreso';
        }

        return {
          is_valid_invoice: true,
          invoice_type: resolvedType === 'ingreso' ? 'ingreso' : 'gasto',
          supplier_name: parsed.supplier_name || cleanSenderName(emailMeta.sender),
          supplier_vat_id: parsed.supplier_vat_id || null,
          invoice_number: parsed.invoice_number || null,
          invoice_date: parsed.invoice_date || (emailMeta.date ? formatDate(emailMeta.date) : null),
          base_amount: parseFloat(parsed.base_amount) || 0,
          tax_rate: parseFloat(parsed.tax_rate) || 0,
          tax_amount: parseFloat(parsed.tax_amount) || 0,
          total_amount: parseFloat(parsed.total_amount) || 0,
          currency: parsed.currency || 'EUR',
          confidence_score: parsed.confidence_score || 0.95,
          raw_ai_json: JSON.stringify(parsed)
        };
      } catch (err) {
        console.error(`Gemini extraction with ${modelName} failed:`, err.message);
      }
    }
  }

  // Fallback heuristic extractor
  return fallbackExtractor(filePath, emailMeta);
}

function cleanSenderName(sender = '') {
  if (!sender) return 'Desconocido';
  const match = sender.match(/^"?([^"<]+)"?\s*<.*>$/);
  if (match && match[1]) return match[1].trim();
  return sender.split('@')[0] || sender;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}
  return new Date().toISOString().split('T')[0];
}

function fallbackExtractor(filePath, emailMeta = {}) {
  const filename = path.basename(filePath);
  const supplier = cleanSenderName(emailMeta.sender);
  const date = emailMeta.date ? formatDate(emailMeta.date) : new Date().toISOString().split('T')[0];
  const isIngreso = /ingreso/i.test(emailMeta.subject || '');

  return {
    is_valid_invoice: true,
    invoice_type: isIngreso ? 'ingreso' : 'gasto',
    supplier_name: supplier,
    supplier_vat_id: null,
    invoice_number: filename.replace(/\.[^/.]+$/, ""),
    invoice_date: date,
    base_amount: 0,
    tax_rate: 21,
    tax_amount: 0,
    total_amount: 0,
    currency: 'EUR',
    confidence_score: 0.3,
    raw_ai_json: JSON.stringify({ note: 'Fallback: Extracción básica' })
  };
}

module.exports = {
  extractInvoiceData
};
