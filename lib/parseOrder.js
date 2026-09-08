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

// Spelled-out quantities, English and Thai â€” covers the realistic range for
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
  à¸«à¸™à¸¶à¹ˆà¸‡: 1,
  à¸ªà¸­à¸‡: 2,
  à¸ªà¸²à¸¡: 3,
  à¸ªà¸µà¹ˆ: 4,
  à¸«à¹‰à¸²: 5,
  à¸«à¸: 6,
  à¹€à¸ˆà¹‡à¸”: 7,
  à¹à¸›à¸”: 8,
  à¹€à¸à¹‰à¸²: 9,
  à¸ªà¸´à¸š: 10,
};

const THAI_CHAR_PATTERN = /[à¸-à¹™]/;

/**
 * Looks for a spelled-out quantity word ("two", "à¸ªà¸²à¸¡", ...) anywhere in the
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
 *   "à¸¥à¸²à¹€à¸à¸­à¸£à¹Œ x 2"          -> 2   (explicit "x N" multiplier)
 *   "à¹‚à¸£à¹€à¸‹à¹ˆ 20L 4 à¸–à¸±à¸‡"       -> 4   ("N à¸–à¸±à¸‡" = N kegs, ignoring the "20L" size)
 *   "Dunkel 1"              -> 1   (bare trailing number)
 *   "lager two" / "à¸¥à¸²à¹€à¸à¸­à¸£à¹Œ à¸ªà¸­à¸‡" -> 2   (spelled-out number, English or Thai)
 * The "20L" / "20 liter" / "20à¸¥à¸´à¸•à¸£" capacity mention is stripped first so it
 * never gets mistaken for the quantity, since every product here is a fixed
 * 20-liter keg. Returns null when no quantity is present at all â€” a bare
 * mention of a product with no number attached is just chat, not an order
 * (e.g. "à¸¥à¸²à¹€à¸à¸­à¸£à¹Œà¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹€à¸¢à¹‡à¸™" or "Rose is no good" shouldn't produce a card).
 */
function extractQuantity(text) {
  const cleaned = text.replace(/20\s*(l\b|liters?|litres?|à¸¥à¸´à¸•à¸£)/gi, ' ');

  const multiplier = cleaned.match(/x\s*(\d+)/i);
  if (multiplier) return toPositiveInt(multiplier[1]);

  const kegCount = cleaned.match(/(\d+)\s*à¸–à¸±à¸‡/);
  if (kegCount) return toPositiveInt(kegCount[1]);

  const fallback = cleaned.match(/\d+/);
  if (fallback) return toPositiveInt(fallback[0]);

  const wordNumber = extractWordNumber(cleaned);
  if (wordNumber) return wordNumber;

  return null;
}

function toPositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ---------------------------------------------------------------------
// Date parsing â€” some orders come in ahead of time for a specific delivery
// date ("5 sep lager x 2"), most don't (just "lager x 2", meaning today).
// ---------------------------------------------------------------------

const MONTHS = {
  jan: 1, january: 1, 'à¸¡.à¸„.': 1, à¸¡à¸à¸£à¸²à¸„à¸¡: 1,
  feb: 2, february: 2, 'à¸.à¸ž.': 2, à¸à¸¸à¸¡à¸ à¸²à¸žà¸±à¸™à¸˜à¹Œ: 2,
  mar: 3, march: 3, 'à¸¡à¸µ.à¸„.': 3, à¸¡à¸µà¸™à¸²à¸„à¸¡: 3,
  apr: 4, april: 4, 'à¹€à¸¡.à¸¢.': 4, à¹€à¸¡à¸©à¸²à¸¢à¸™: 4,
  may: 5, 'à¸ž.à¸„.': 5, à¸žà¸¤à¸©à¸ à¸²à¸„à¸¡: 5,
  jun: 6, june: 6, 'à¸¡à¸´.à¸¢.': 6, à¸¡à¸´à¸–à¸¸à¸™à¸²à¸¢à¸™: 6,
  jul: 7, july: 7, 'à¸.à¸„.': 7, à¸à¸£à¸à¸Žà¸²à¸„à¸¡: 7,
  aug: 8, august: 8, 'à¸ª.à¸„.': 8, à¸ªà¸´à¸‡à¸«à¸²à¸„à¸¡: 8,
  sep: 9, sept: 9, september: 9, 'à¸.à¸¢.': 9, à¸à¸±à¸™à¸¢à¸²à¸¢à¸™: 9,
  oct: 10, october: 10, 'à¸•.à¸„.': 10, à¸•à¸¸à¸¥à¸²à¸„à¸¡: 10,
  nov: 11, november: 11, 'à¸ž.à¸¢.': 11, à¸žà¸¤à¸¨à¸ˆà¸´à¸à¸²à¸¢à¸™: 11,
  dec: 12, december: 12, 'à¸˜.à¸„.': 12, à¸˜à¸±à¸™à¸§à¸²à¸„à¸¡: 12,
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

/** "2026-09-05" â€” used as the compact, sortable form stored in the sheet and postback data. */
function formatDateISO({ year, month, day }) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "5 Sep" â€” used in the confirmation card, where the year is rarely needed. */
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
// full ISO date â€” this compact form exists purely to shrink the payload.
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
 * semicolons, line breaks, and the words "and" / "à¹à¸¥à¸°" / "à¸à¸±à¸š" (Thai for
 * "and" / "with"). "à¸¥à¸²à¹€à¸à¸­à¸£à¹Œ x 1, à¹‚à¸£à¹€à¸‹à¹ˆ x 2" -> ["à¸¥à¸²à¹€à¸à¸­à¸£à¹Œ x 1", "à¹‚à¸£à¹€à¸‹à¹ˆ x 2"].
 */
function splitIntoClauses(text) {
  return text
    .split(/,|;|\n|\band\b|à¹à¸¥à¸°|à¸à¸±à¸š/gi)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Finds every occurrence of every product keyword in a chunk of text (not
 * just the first, and not just the first product) â€” this is what lets a
 * single clause like "Lager 2 Rose 3 Dunkel 1" (no commas at all) be read as
 * three separate mentions instead of one. Returns them in the order they
 * appear, with any overlapping match (e.g. one keyword's text sitting inside
 * another's) collapsed down to whichever was found first.
 */
function findAllKeywordOccurrences(text) {
  const lowerText = text.toLowerCase();
  const products = loadProducts();
  const occurrences = [];

  for (const product of products) {
    for (const keyword of product.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (!lowerKeyword) continue;
      let searchFrom = 0;
      let idx;
      while ((idx = lowerText.indexOf(lowerKeyword, searchFrom)) !== -1) {
        occurrences.push({ product, start: idx, end: idx + lowerKeyword.length });
        searchFrom = idx + lowerKeyword.length;
      }
    }
  }

  occurrences.sort((a, b) => a.start - b.start || b.end - a.end);

  const filtered = [];
  let lastEnd = -1;
  for (const occ of occurrences) {
    if (occ.start >= lastEnd) {
      filtered.push(occ);
      lastEnd = occ.end;
    }
  }
  return filtered;
}

/**
 * Finds every product mentioned in a single clause, each with its own
 * quantity â€” supporting a run of items with no separator between them at
 * all, e.g. "Lager 2 Rose 3 Dunkel 1". For each keyword occurrence, the
 * quantity is looked for only in the text between that keyword and the
 * *next* one (or the end of the clause), so each item only "sees" the
 * number meant for it. This means a quantity has to come after the product
 * name to be picked up â€” matching how people actually type these orders.
 *
 * A keyword with no quantity anywhere in its segment is dropped entirely
 * rather than defaulting to 1 â€” someone just mentioning a product in
 * passing ("à¸¥à¸²à¹€à¸à¸­à¸£à¹Œà¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹€à¸¢à¹‡à¸™", "Rose is no good") isn't placing an order,
 * so it produces nothing rather than a false confirmation card.
 */
function matchProductsInClause(clause) {
  const dateMatch = extractDate(clause);
  // Strip the date substring first so its digits never get mistaken for a
  // quantity (e.g. the "5" in "5 sep lager 2" is a day-of-month, not a count).
  const remainder = dateMatch ? clause.replace(dateMatch.matchedText, ' ') : clause;
  const date = dateMatch ? { year: dateMatch.year, month: dateMatch.month, day: dateMatch.day } : null;
  const explicitDate = Boolean(dateMatch);

  const occurrences = findAllKeywordOccurrences(remainder);
  const orders = [];

  for (let i = 0; i < occurrences.length; i++) {
    const occ = occurrences[i];
    const next = occurrences[i + 1];
    const segment = remainder.slice(occ.start, next ? next.start : remainder.length);
    const quantity = extractQuantity(segment);
    if (quantity === null) continue; // just a mention, not an order

    orders.push({
      productId: occ.product.id,
      productName: occ.product.name,
      quantity,
      price: typeof occ.product.price === 'number' ? occ.product.price : null,
      date,
      explicitDate,
    });
  }

  return orders;
}

// "One of each" â€” customers occasionally order this way instead of naming
// products: "à¹€à¸­à¸²à¸­à¸¢à¹ˆà¸²à¸‡à¸¥à¸°à¸–à¸±à¸‡" / "à¸­à¸¢à¹ˆà¸²à¸‡à¸¥à¸° 2 à¸–à¸±à¸‡" (Thai, "N of each"), or the
// English equivalent "one of each" / "2 of everything". In practice this
// only ever means Lager + Rose â€” Dunkel isn't stocked widely enough for
// people to expect it by default â€” so it's handled as its own pattern
// rather than a per-product keyword.
const THAI_EACH_RE = /(?:à¹€à¸­à¸²\s*)?à¸­à¸¢à¹ˆà¸²à¸‡à¸¥à¸°\s*(\d+)?\s*à¸–à¸±à¸‡?/;
const ENGLISH_EACH_RE = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|some|a)\s+of\s+(?:each|everything)\b/i;

/**
 * Detects the "one of each" ordering pattern in a clause and, if present,
 * returns a Lager + Rose order at the requested quantity (defaulting to 1
 * when no number is given). Returns an empty array when the pattern isn't
 * present at all, so callers can fall back to normal per-product matching.
 */
function matchEachOfEveryClause(clause) {
  const dateMatch = extractDate(clause);
  const remainder = dateMatch ? clause.replace(dateMatch.matchedText, ' ') : clause;
  const date = dateMatch ? { year: dateMatch.year, month: dateMatch.month, day: dateMatch.day } : null;
  const explicitDate = Boolean(dateMatch);

  let quantity = null;

  const thaiMatch = remainder.match(THAI_EACH_RE);
  if (thaiMatch) {
    quantity = thaiMatch[1] ? toPositiveInt(thaiMatch[1]) : extractWordNumber(remainder) || 1;
  } else {
    const englishMatch = remainder.match(ENGLISH_EACH_RE);
    if (englishMatch) {
      const token = englishMatch[1].toLowerCase();
      if (/^\d+$/.test(token)) quantity = toPositiveInt(token);
      else if (token === 'some' || token === 'a') quantity = 1;
      else quantity = NUMBER_WORDS[token] || 1;
    }
  }

  if (quantity === null) return [];

  const products = loadProducts();
  const targets = ['keg_lager', 'keg_rose']
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);

  return targets.map((product) => ({
    productId: product.id,
    productName: product.name,
    quantity,
    price: typeof product.price === 'number' ? product.price : null,
    date,
    explicitDate,
  }));
}

/**
 * Scans free-form chat text for every product order mentioned, supporting
 * multiple items in one message whether they're separated by a comma,
 * semicolon, line break, "and"/"à¹à¸¥à¸°"/"à¸à¸±à¸š", or not separated at all, e.g.:
 *   "lager x 1, rose x 2" -> two orders
 *   "Lager 2 Rose 3 Dunkel 1" -> three orders, no punctuation needed
 *   "5 sep lager x 2\n8 sep rose x 3" -> two orders on two different dates
 *   "à¹€à¸­à¸²à¸­à¸¢à¹ˆà¸²à¸‡à¸¥à¸°à¸–à¸±à¸‡" / "2 of each" -> one Lager + one Rose order (or 2 of
 *   each), since that's what "one of each" means in practice for this menu
 * A product mentioned with no quantity attached anywhere is treated as
 * ordinary chat, not an order, and produces nothing. Items with no explicit
 * date default to today (Bangkok time), since most orders are wanted
 * immediately. Returns an empty array when nothing order-shaped is found.
 */
function parseOrders(text) {
  if (!text || typeof text !== 'string') return [];

  const clauses = splitIntoClauses(text);
  const orders = [];
  for (const clause of clauses) {
    const eachOrders = matchEachOfEveryClause(clause);
    const clauseOrders = eachOrders.length ? eachOrders : matchProductsInClause(clause);
    for (const order of clauseOrders) {
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
