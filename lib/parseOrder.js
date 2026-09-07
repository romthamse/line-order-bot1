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

/**
 * Pulls the order quantity out of informal chat text, e.g.:
 *   "ลาเกอร์ x 2"          -> 2   (explicit "x N" multiplier)
 *   "โรเซ่ 20L 4 ถัง"       -> 4   ("N ถัง" = N kegs, ignoring the "20L" size)
 *   "Dunkel 1"              -> 1   (bare trailing number)
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

  return 1;
}

function toPositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Scans free-form chat text for the first matching product keyword.
 * Returns null when nothing matches (the common case — most chat messages
 * are not orders), or an order object describing the detected product and
 * quantity.
 */
function parseOrder(text) {
  if (!text || typeof text !== 'string') return null;
  const products = loadProducts();
  const lowerText = text.toLowerCase();

  for (const product of products) {
    for (const keyword of product.keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return {
          productId: product.id,
          productName: product.name,
          quantity: extractQuantity(text),
          price: typeof product.price === 'number' ? product.price : null,
        };
      }
    }
  }
  return null;
}

module.exports = { parseOrder, loadProducts, extractQuantity };
