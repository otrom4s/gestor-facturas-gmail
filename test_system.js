const { detectInvoicePortalLinks } = require('./src/services/linkDetector');
const db = require('./src/database');

console.log('--- Testing SQLite Database ---');
const tables = db.all("SELECT name FROM sqlite_master WHERE type='table'");
console.log('Tables initialized:', tables.map(t => t.name));

console.log('\n--- Testing Link Detector for Portal Invoices ---');
const sampleHtml1 = `
  <div>
    <h2>Su factura de Febrero ya está lista</h2>
    <p>Hola Adrián, le informamos de que hemos emitido su factura correspondiente al periodo de facturación.</p>
    <p>Puede consultar el detalle y descargarla accediendo a su cuenta:</p>
    <a href="https://areaclientes.vodafone.es/factura/2026/02" style="background:#e60000; color:#fff; padding:10px;">Ver factura en el portal de clientes</a>
    <br><br>
    <a href="https://vodafone.es/politica-privacidad">Política de privacidad</a>
    <a href="https://vodafone.es/unsubscribe">Darme de baja</a>
  </div>
`;

const detected1 = detectInvoicePortalLinks(sampleHtml1);
console.log('Test 1 (Vodafone portal):', JSON.stringify(detected1, null, 2));

const sampleHtml2 = `
  <div>
    <p>Tu recibo mensual de suscripción Cloud está disponible.</p>
    <p>Para ver el desglose completo, <a href="https://cloud.proveedor.com/billing/invoices">entra a tu área de cliente para descargar la factura</a>.</p>
  </div>
`;

const detected2 = detectInvoicePortalLinks(sampleHtml2);
console.log('\nTest 2 (Área de cliente):', JSON.stringify(detected2, null, 2));
