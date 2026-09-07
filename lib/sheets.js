const { google } = require('googleapis');

let cachedAuth = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  cachedAuth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return cachedAuth;
}

/**
 * Appends one confirmed order as a row to the configured Google Sheet.
 * Columns: Timestamp | Group/Room ID | Requester | Product | Quantity |
 * Total (THB) | Status
 */
async function appendOrder(order) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const sheetName = process.env.SHEET_NAME || 'Orders';
  const total = order.price ? order.price * order.quantity : '';

  const values = [[
    new Date().toISOString(),
    order.groupId || '',
    order.userName || '',
    order.productName,
    order.quantity,
    total,
    'Confirmed',
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:G`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

module.exports = { appendOrder };
