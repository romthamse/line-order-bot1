const fs = require('fs');
const path = require('path');

let cachedProducts = null;

/**
 * Loads the product/keyword list from config/products.json.
 * Cached after first read (the file only changes on redeploy, since this
 * runs in a serverless function).
 */
function loadProducts() {
  if (cachedProducts) return cachedProducts;
  const configPath = path.join(process.cwd(), 'config', 'products.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  cachedProducts = JSON.parse(raw);
  return cachedProducts;
}

// Spelled-out quantities, English and Thai — covers the realistic range for
// keg orders (nobody's typing "twelve" for a 20L keg order, but if they do,
// this just falls through to the digit/default handling below).
const NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  หนึ่ง: 1,
  สอง: 2,
  สาม: 3,
  สี่: 4,
  ห้า: 5,
  หก: 6,
  เจ็ด: 7,
  แปด: 8,
  เก้า: 9,
  สิบ: 10,
};

const THAI_CHAR_PATTERN = /[ก-๙]/;

/**
 * Looks for a spelled-out quantity word ("two", "สาม", ...) anywhere in the
 * text. English words are matched on whole-word boundaries only (so "ten"
 * doesn't fire inside "often"); Thai words are matched as a plain substring
 * since Thai script doesn't use spaces between words. Returns null if none
 * of the known words are present.
 */
function extractWordNumber(text) {
  const lowerText = text.toLowerCase();
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (THAI_CHAR_PATTERN.test(word)) {
      if (text.includes(word)) return value;
    } else if (new RegExp(`\\b${word}\\b`, 'i').test(lowerText)) {
      return value;
    }
  }
  return null;
}

/**
 * Pulls the order quantity out of informal chat text, e.g.:
 *   "ลาเกอร์ x 2"          -> 2   (explicit "x N" multiplier)
 *   "โรเซ่ 20L 4 ถัง"       -> 4   ("N ถัง" = N kegs, ignoring the "20L" size)
 *   "Dunkel 1"              -> 1   (bare trailing number)
 *   "lager two" / "ลาเกอร์ สอง" -> 2   (spelled-out number, English or Thai)
 * The "20L" / "20 liter" / "20ลิตร" capacity mention is stripped first so it
 * never gets mistaken for the quantity, since every product here is a fixed
 * 20-liter keg. Defaults to 1 when no quantity is present at all.
 */
function extractQuantity(text) {
  const cleaned = text.replace(/20\s*(l\b|liters?|litres?|ลิตร)/gi, ' ');

  const multiplier = cleaned.match(/x\s*(\d+)/i);
  if (multiplier) return toPositiveInt(multiplier[1]);

  const kegCount = cleaned.match(/(\d+)\s*ถัง/);
  if (kegCount) return toPositiveInt(kegCount[1]);

  const fallback = cleaned.match(/\d+/);
  if (fallback) return toPositiveInt(fallback[0]);

  const wordNumber = extractWordNumber(cleaned);
  if (wordNumber) return wordNumber;

  return 1;
}

function toPositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ---------------------------------------------------------------------
// Date parsing — some orders come in ahead of time for a specific delivery
// date ("5 sep lager x 2"), most don't (just "lager x 2", meaning today).
// ---------------------------------------------------------------------

const MONTHS = {
  jan: 1, january: 1, 'ม.ค.': 1, มกราคม: 1,
  feb: 2, february: 2, 'ก.พ.': 2, กุมภาพันธ์: 2,
  mar: 3, march: 3, 'มี.ค.': 3, มีนาคม: 3,
  apr: 4, april: 4, 'เม.ย.': 4, เมษายน: 4,
  may: 5, 'พ.ค.': 5, พฤษภาคม: 5,
  jun: 6, june: 6, 'มิ.ย.': 6, มิถุนายน: 6,
  jul: 7, july: 7, 'ก.ค.': 7, กรกฎาคม: 7,
  aug: 8, august: 8, 'ส.ค.': 8, สิงหาคม: 8,
  sep: 9, sept: 9, september: 9, 'ก.ย.': 9, กันยายน: 9,
  oct: 10, october: 10, 'ต.ค.': 10, ตุลาคม: 10,
  nov: 11, november: 11, 'พ.ย.': 11, พฤศจิกายน: 11,
  dec: 12, december: 12, 'ธ.ค.': 12, ธันวาคม: 12,
};

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest names first so "september" matches in full rather than stopping
// at "sep".
const MONTH_PATTERN = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|');

const DAY_MONTH_RE = new RegExp(`\\b(\\d{1,2})\\s*(${MONTH_PATTERN})\\.?\\s*(\\d{2,4})?\\b`, 'i');
const MONTH_DAY_RE = new RegExp(`\\b(${MONTH_PATTERN})\\.?\\s*(\\d{1,2})\\s*(\\d{2,4})?\\b`, 'i');
const NUMERIC_DATE_RE = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/;

function normalizeYear(y) {
  if (!y) return todayInBangkok().year;
  const n = parseInt(y, 10);
  return n < 100 ? 2000 + n : n;
}

function isValidDate(day, month) {
  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= 31;
}

/**
 * Finds an explicit date mention in a clause ("5 sep", "Sep 5", "5/9", each
 * optionally followed by a year). Returns { year, month, day, matchedText }
 * for the first match found, or null if the clause has no date in it.
 */
function extractDate(text) {
  let m = text.match(DAY_MONTH_RE);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = MONTHS[m[2].toLowerCase()];
    if (isValidDate(day, month)) {
      return { year: normalizeYear(m[3]), month, day, matchedText: m[0] };
    }
  }

  m = text.match(MONTH_DAY_RE);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = parseInt(m[2], 10);
    if (isValidDate(day, month)) {
      return { year: normalizeYear(m[3]), month, day, matchedText: m[0] };
    }
  }

  m = text.match(NUMERIC_DATE_RE);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (isValidDate(day, month)) {
      return { year: normalizeYear(m[3]), month, day, matchedText: m[0] };
    }
  }

  return null;
}

/** Today's calendar date in the business's local timezone (Bangkok, UTC+7). */
function todayInBangkok() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return { year: parseInt(map.year, 10), month: parseInt(map.month, 10), day: parseInt(map.day, 10) };
}

/** "2026-09-05" — used as the compact, sortable form stored in the sheet and postback data. */
function formatDateISO({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "5 Sep" — used in the confirmation card, where the year is rarely needed. */
function formatDateDisplay({ year, month, day }) {
  return `${day} ${MONTH_ABBR[month - 1]}`;
}

/** "2026-09-05" -> { year, month, day } */
function parseDateISO(iso) {
  const [year, month, day] = iso.split('-').map((n) => parseInt(n, 10));
  return { year, month, day };
}

// Compact 6-digit form ("260905") used only inside the postback `data`
// payload, to leave more of LINE's 300-byte budget for the display name
// when a message has the maximum 3 dated items. The sheet still gets the
// full ISO date — this compact form exists purely to shrink the payload.
function formatDateCompact({ year, month, day }) {
  return `${String(year).slice(-2)}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function parseDateCompact(compact) {
  const year = 2000 + parseInt(compact.slice(0, 2), 10);
  const month = parseInt(compact.slice(2, 4), 10);
  const day = parseInt(compact.slice(4, 6), 10);
  return { year, month, day };
}

/**
 * Splits a message into separate order "clauses" on common separators people
 * use when listing more than one item in a single message: commas,
 * semicolons, line breaks, and the words "and" / "และ" / "กับ" (Thai for
 * "and" / "with"). "ลาเกอร์ x 1, โรเซ่ x 2" -> ["ลาเกอร์ x 1", "โรเซ่ x 2"].
 */
function splitIntoClauses(text) {
  return text
    .split(/,|;|\n|\band\b|และ|กับ/gi)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Finds the first product keyword mentioned in a single clause of text and
 * returns its detected quantity and (optional) requested date. Returns null
 * if no product keyword is present in the clause.
 */
function matchProductInClause(clause) {
  const dateMatch = extractDate(clause);
  // Strip the date substring first so its digits never get mistaken for the
  // quantity (e.g. the "5" in "5 sep lager 2" is a day-of-month, not a count).
  const remainder = dateMatch ? clause.replace(dateMatch.matchedText, ' ') : clause;
  const lowerRemainder = remainder.toLowerCase();

  const products = loadProducts();
  for (const product of products) {
    for (const keyword of product.keywords) {
      if (lowerRemainder.includes(keyword.toLowerCase())) {
        return {
          productId: product.id,
          productName: product.name,
          quantity: extractQuantity(remainder),
          price: typeof product.price === 'number' ? product.price : null,
          date: dateMatch ? { year: dateMatch.year, month: dateMatch.month, day: dateMatch.day } : null,
          explicitDate: Boolean(dateMatch),
        };
      }
    }
  }
  return null;
}

/**
 * Scans free-form chat text for every product keyword mentioned, supporting
 * multiple items in one message when they're separated by a comma,
 * semicolon, line break, or "and"/"และ"/"กับ", e.g.:
 *   "lager x 1, rose x 2" -> two orders
 *   "5 sep lager x 2\n8 sep rose x 3" -> two orders on two different dates
 * A message with no separators only yields its first match (there's no
 * reliable way to tell where one item's mention ends and the next begins
 * without one). Items with no explicit date default to today (Bangkok
 * time), since most orders are wanted immediately. Returns an empty array
 * when nothing matches at all.
 */
function parseOrders(text) {
  if (!text || typeof text !== 'string') return [];

  const clauses = splitIntoClauses(text);
  const orders = [];
  for (const clause of clauses) {
    const order = matchProductInClause(clause);
    if (order) {
      if (!order.date) order.date = todayInBangkok();
      orders.push(order);
    }
  }
  return orders;
}

/**
 * Back-compat single-order helper: returns the first detected order (or
 * null), ignoring any additional items in the same message.
 */
function parseOrder(text) {
  const orders = parseOrders(text);
  return orders.length > 0 ? orders[0] : null;
}

module.exports = {
  parseOrder,
  parseOrders,
  loadProducts,
  extractQuantity,
  todayInBangkok,
  formatDateISO,
  formatDateDisplay,
  parseDateISO,
  formatDateCompact,
  parseDateCompact,
};
