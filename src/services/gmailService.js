const { google } = require('googleapis');
const config = require('../config');
const db = require('../database');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES
  });
}

async function getTokensFromCode(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();

  return {
    email: userInfo.data.email,
    name: userInfo.data.name || userInfo.data.email.split('@')[0],
    picture: userInfo.data.picture || '',
    tokens
  };
}

function getClientForAccount(account) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.token_expiry
  });

  oauth2Client.on('tokens', (newTokens) => {
    db.run(
      `UPDATE accounts 
       SET access_token = ?, 
           token_expiry = ?, 
           refresh_token = COALESCE(?, refresh_token) 
       WHERE id = ?`,
      [
        newTokens.access_token,
        newTokens.expiry_date,
        newTokens.refresh_token || null,
        account.id
      ]
    );
  });

  return oauth2Client;
}

/**
 * Searches messages in the connected Gmail account using query filters
 */
async function searchMessages(authClient, query = 'factura OR invoice OR bill OR recibo', maxResults = 50) {
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults
  });

  return response.data.messages || [];
}

/**
 * Retrieves the full email structure, headers, body and attachments
 */
async function getMessageDetails(authClient, messageId) {
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full'
  });

  const message = response.data;
  const headers = message.payload.headers || [];

  const getHeader = (name) => {
    const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
  };

  const subject = getHeader('Subject');
  const sender = getHeader('From');
  const date = getHeader('Date');

  let bodyHtml = '';
  let bodyText = '';
  const attachments = [];

  function traverseParts(part) {
    if (!part) return;

    if (part.filename && part.body && part.body.attachmentId) {
      const filename = part.filename.trim();
      const size = part.body.size || 0;

      // Filter 1: Ignore email signature images and icons (< 35KB or typical signature names)
      const isSignatureImage = 
        /^(image\d{3}|logo|signature|firma|banner|footer|icon|social|icon_)\.(png|jpe?g|gif|webp)$/i.test(filename) ||
        (size > 0 && size < 35000 && /\.(png|jpe?g)$/i.test(filename));

      // Filter 2: Ignore Spanish Tax Models, travel tickets (vuelos, trenes, boletos), certificates, IDs
      const isTravelOrTaxOrGovDoc = 
        /(\b(modelo|mod)\s*(036|037|111|115|123|130|131|190|200|202|303|347|349|390)\b|\b(111|115|130|190|303|349|390)\s+\d[tT]\b|\b(vuelo|flight|boarding|billete|boletos?|tren|perurail|renfe|vueling|iberia|ryanair|air\s*europa|pasaje|reserva\s*hotel|booking|airbnb|certificado|empadronamiento|titularidad|dni|nie|pasaporte|presentaci[oó]n|gr[aá]fico|tpv-cripto)\b)/i.test(filename);

      // Check if it's a legitimate PDF, XML or real invoice scan image
      const isInvoiceCandidate = 
        (/\.(pdf|xml)$/i.test(filename) || (/\.(png|jpe?g)$/i.test(filename) && size >= 35000)) &&
        !isSignatureImage &&
        !isTravelOrTaxOrGovDoc;

      if (isInvoiceCandidate) {
        attachments.push({
          partId: part.partId,
          filename: filename,
          mimeType: part.mimeType,
          attachmentId: part.body.attachmentId,
          size: size
        });
      }
    }

    if (part.mimeType === 'text/html' && part.body && part.body.data) {
      bodyHtml += Buffer.from(part.body.data, 'base64url').toString('utf-8');
    } else if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      bodyText += Buffer.from(part.body.data, 'base64url').toString('utf-8');
    }

    if (part.parts && Array.isArray(part.parts)) {
      for (const subPart of part.parts) {
        traverseParts(subPart);
      }
    }
  }

  traverseParts(message.payload);

  return {
    id: messageId,
    threadId: message.threadId,
    internalDate: message.internalDate,
    subject,
    sender,
    date,
    bodyHtml,
    bodyText,
    attachments
  };
}

/**
 * Downloads a binary attachment by attachmentId
 */
async function downloadAttachment(authClient, messageId, attachmentId) {
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const response = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId
  });

  return Buffer.from(response.data.data, 'base64url');
}

module.exports = {
  createOAuth2Client,
  getAuthUrl,
  getTokensFromCode,
  getClientForAccount,
  searchMessages,
  getMessageDetails,
  downloadAttachment
};
