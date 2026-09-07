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

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function sheetName() {
  return process.env.SHEET_NAME || 'Orders';
}

/**
 * Checks whether this order id has already been logged — used to stop a
 * second tap of the same Confirm button (LINE can't disable or remove a
 * button once a message is sent, so this is what actually prevents a
 * duplicate row instead). Column I holds the Order ID for every row.
 */
async function hasOrderId(orderId) {
  if (!orderId) return false;
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName()}!I:I`,
  });
  const rows = response.data.values || [];
  return rows.some((row) => row[0] === orderId);
}

/**
 * Appends one row per confirmed order item to the configured Google Sheet,
 * all in a single API call. Columns: Timestamp | Order Date | Group
 * | Requester | Product | Quantity | Total (THB) | Status | Order ID
 *
 * Timestamp is when the order was confirmed; Order Date is the delivery
 * date the order was requested for (defaults to the day it was sent, when
 * no specific date was mentioned in the chat message). Group is the LINE
 * chat's actual name (e.g. the shop/branch), resolved at detection time —
 * not the raw internal chat id. Order ID is the dedup key shared by every
 * row from the same confirmed message.
 *
 * `orders` is an array of { productName, quantity, price, orderDateISO }.
 * `meta` is { userName, chatName, orderId } — shared across every row in
 * this batch (they all came from the same confirmed message).
 */
async function appendOrders(orders, meta) {
  const sheets = getSheetsClient();
  const timestamp = new Date().toISOString();
  const { userName, chatName, orderId } = meta || {};

  const values = orders.map((order) => {
    const total = order.price ? order.price * order.quantity : '';
    return [
      timestamp,
      order.orderDateISO || '',
      chatName || '',
      userName || '',
      order.productName,
      order.quantity,
      total,
      'Confirmed',
      orderId || '',
    ];
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName()}!A:I`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

/** Back-compat single-order helper. */
async function appendOrder(order) {
  return appendOrders([order], { userName: order.userName, chatName: order.chatName });
}

module.exports = { appendOrder, appendOrders, hasOrderId };
