const cheerio = require('cheerio');

// Keywords indicative of external portal invoice links
const INVOICE_LINK_REGEX = /(ver|descargar?|consultar|acceder|bajar|obtener|revisar|comprobar)\s+(a\s+)?(tu\s+|la\s+|el\s+)?(factura|recibo|comprobante|albar[aá]n|cuenta|detalle)/i;
const PORTAL_KEYWORDS_REGEX = /(área|area|portal|zona|espacio|oficina|sede)\s+(de\s+|del\s+)?(clientes?|privad[ao]|usuarios?|abonados?|gesti[oó]n)/i;
const CLIENT_ACCOUNT_REGEX = /(mi\s+cuenta|acceso\s+clientes?|panel\s+de\s+control|zona\s+de\s+usuarios?)/i;
const ENGLISH_INVOICE_REGEX = /(view|download|access|get|check)\s+(your\s+)?(invoice|bill|receipt|statement)/i;
const ENGLISH_PORTAL_REGEX = /(customer|client)\s+(portal|area|account|dashboard)/i;

// Ignored link patterns (unsubscribe, legal, social networks, etc.)
const IGNORED_URL_REGEX = /(unsubscribe|optout|dar-de-baja|twitter\.com|facebook\.com|instagram\.com|linkedin\.com|youtube\.com|privacy|terminos|politica-privacidad)/i;

/**
 * Inspects HTML and plain text email content to detect if the email points to an external portal
 * where the user needs to log in to view or download their invoice.
 * 
 * @param {string} html - HTML body of the email
 * @param {string} text - Plain text body of the email
 * @returns {Array<{ portalUrl: string, linkText: string, contextSnippet: string }>}
 */
function detectInvoicePortalLinks(html, text = '') {
  const detectedLinks = [];
  if (!html && !text) return detectedLinks;

  if (html) {
    const $ = cheerio.load(html);

    $('a').each((i, el) => {
      const $el = $(el);
      const href = ($el.attr('href') || '').trim();
      const linkText = $el.text().replace(/\s+/g, ' ').trim();
      const parentText = $el.parent().text().replace(/\s+/g, ' ').trim();

      if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
        return;
      }

      if (IGNORED_URL_REGEX.test(href) || IGNORED_URL_REGEX.test(linkText)) {
        return;
      }

      // Check if the link text or surrounding paragraph matches invoice portal patterns
      const matchesDirect = INVOICE_LINK_REGEX.test(linkText) || ENGLISH_INVOICE_REGEX.test(linkText);
      const matchesPortal = PORTAL_KEYWORDS_REGEX.test(linkText) || CLIENT_ACCOUNT_REGEX.test(linkText) || ENGLISH_PORTAL_REGEX.test(linkText);
      const matchesContext = (INVOICE_LINK_REGEX.test(parentText) || PORTAL_KEYWORDS_REGEX.test(parentText)) && linkText.length > 2;

      if (matchesDirect || matchesPortal || matchesContext) {
        // Avoid duplicate URLs
        if (!detectedLinks.some(d => d.portalUrl === href)) {
          detectedLinks.push({
            portalUrl: href,
            linkText: linkText || 'Ver factura / Acceder al portal',
            contextSnippet: parentText.slice(0, 200) || linkText
          });
        }
      }
    });
  }

  // If no HTML link found, inspect plain text for explicit URLs next to invoice keywords
  if (detectedLinks.length === 0 && text) {
    const lines = text.split('\n');
    for (const line of lines) {
      if (INVOICE_LINK_REGEX.test(line) || PORTAL_KEYWORDS_REGEX.test(line) || CLIENT_ACCOUNT_REGEX.test(line)) {
        const urlMatch = line.match(/https?:\/\/[^\s"'<>]+/);
        if (urlMatch && !IGNORED_URL_REGEX.test(urlMatch[0])) {
          detectedLinks.push({
            portalUrl: urlMatch[0],
            linkText: 'Enlace detectado en el texto del correo',
            contextSnippet: line.trim().slice(0, 200)
          });
          break;
        }
      }
    }
  }

  return detectedLinks;
}

module.exports = {
  detectInvoicePortalLinks
};
