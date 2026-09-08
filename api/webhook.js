const { Client, validateSignature } = require('@line/bot-sdk');
const { parseOrders, loadProducts, parseDateCompact, formatDateISO } = require('../lib/parseOrder');
const { buildConfirmMessage } = require('../lib/flex');
const { appendOrders, hasOrderId, deleteOrderRows } = require('../lib/sheets');

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new Client(lineConfig);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).send('LINE order bot webhook is running.');
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-line-signature'];

  if (!signature || !validateSignature(rawBody, lineConfig.channelSecret, signature)) {
    res.status(401).send('Invalid signature');
    return;
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    res.status(400).send('Bad request');
    return;
  }

  const events = body.events || [];

  // Respond to LINE immediately after processing; LINE expects a fast 200.
  await Promise.all(events.map((event) => handleEvent(event).catch((err) => {
    console.error('Error handling LINE event', err);
  })));

  res.status(200).json({ status: 'ok' });
}

// Vercel: disable the automatic JSON body parser so we can read the raw
// body ourselves — required to verify LINE's HMAC signature.
handler.config = {
  api: {
    bodyParser: false,
  },
};

async function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    return handleMessage(event);
  }
  if (event.type === 'postback') {
    return handlePostback(event);
  }
  return null;
}

async function resolveDisplayName(event) {
  const { source } = event;
  try {
    if (source.type === 'group') {
      const profile = await client.getGroupMemberProfile(source.groupId, source.userId);
      return profile.displayName;
    }
    if (source.type === 'room') {
      const profile = await client.getRoomMemberProfile(source.roomId, source.userId);
      return profile.displayName;
    }
    const profile = await client.getProfile(source.userId);
    return profile.displayName;
  } catch (e) {
    // Profile lookups can fail (e.g. user hasn't added the bot as a
    // friend) — fall back to a generic label rather than failing the flow.
    return 'Someone';
  }
}

/**
 * Resolves a human-readable name for the chat the order came from, so the
 * sheet shows which shop/group placed it instead of a raw internal id.
 * Only "group" chats have a name in LINE's API — "room" chats (unnamed
 * multi-person chats) and 1:1 chats don't, so those fall back to a plain
 * label instead.
 */
async function resolveChatName(event) {
  const { source } = event;
  try {
    if (source.type === 'group') {
      const summary = await client.getGroupSummary(source.groupId);
      return summary.groupName;
    }
    if (source.type === 'room') {
      return 'Unnamed group chat';
    }
    return 'Direct message';
  } catch (e) {
    // getGroupSummary can fail if the bot was just added and LINE hasn't
    // synced the group's info yet — fall back rather than failing the flow.
    return 'Unknown chat';
  }
}

async function handleMessage(event) {
  const text = event.message.text;
  const orders = parseOrders(text);
  if (!orders.length) return null; // Passive listening: ignore anything that isn't order-shaped.

  const [userName, chatName] = await Promise.all([
    resolveDisplayName(event),
    resolveChatName(event),
  ]);

  const message = buildConfirmMessage(orders, { userName, chatName });
  return client.replyMessage(event.replyToken, message);
}

async function handlePostback(event) {
  let data;
  try {
    data = JSON.parse(event.postback.data);
  } catch (e) {
    return null;
  }

  if (data.a === 'confirm') {
    // LINE can't remove or disable buttons on a message once it's sent, so
    // this is the actual safeguard against a duplicate: refuse a second
    // Confirm tap on the same card rather than logging it again.
    if (await hasOrderId(data.i)) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'This order was already confirmed earlier — no need to confirm it again.',
      });
    }

    const products = loadProducts();
    const resolvedOrders = (data.o || []).map((item) => {
      const product = products.find((p) => p.id === item.p);
      return {
        productName: product ? product.name : item.p,
        quantity: item.q,
        price: product && typeof product.price === 'number' ? product.price : null,
        orderDateISO: item.t ? formatDateISO(parseDateCompact(item.t)) : '',
      };
    });

    await appendOrders(resolvedOrders, { userName: data.d, chatName: data.n, orderId: data.i });

    const summary = resolvedOrders.map((o) => `${o.quantity}x ${o.productName}`).join(', ');
    const grandTotal = resolvedOrders.reduce(
      (sum, o) => sum + (o.price ? o.price * o.quantity : 0),
      0
    );
    const totalText = grandTotal ? ` (${grandTotal} THB)` : '';

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ Order confirmed: ${summary}${totalText} for ${data.d}. Logged to the sheet.`,
    });
  }

  if (data.a === 'cancel') {
    // The same Cancel button stays clickable even after Confirm was already
    // tapped on this card (LINE has no way to disable it), so a tap here
    // isn't always a no-op — if the order was already written to the sheet,
    // this is someone changing their mind, and the row(s) should come back
    // out.
    const removed = await deleteOrderRows(data.i);
    if (removed > 0) {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🗑️ Order was already confirmed — removed it from the sheet.',
      });
    }

    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `❌ Order cancelled.`,
    });
  }

  return null;
}

module.exports = handler;
