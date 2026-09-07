const { Client, validateSignature } = require('@line/bot-sdk');
const { parseOrder } = require('../lib/parseOrder');
const { buildConfirmMessage } = require('../lib/flex');
const { appendOrder } = require('../lib/sheets');

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

async function handleMessage(event) {
  const text = event.message.text;
  const order = parseOrder(text);
  if (!order) return null; // Passive listening: ignore anything that isn't order-shaped.

  const groupId = event.source.groupId || event.source.roomId || null;
  const userName = await resolveDisplayName(event);

  const fullOrder = {
    ...order,
    userId: event.source.userId,
    userName,
    groupId,
  };

  const message = buildConfirmMessage(fullOrder);
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
    await appendOrder({
      productId: data.p,
      productName: data.n,
      quantity: data.q,
      price: data.pr || null,
      userName: data.d,
      groupId: data.g,
    });
    const total = data.pr ? ` (${data.q * data.pr} THB)` : '';
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `✅ Order confirmed: ${data.q}x ${data.n}${total} for ${data.d}. Logged to the sheet.`,
    });
  }

  if (data.a === 'cancel') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `❌ Order cancelled: ${data.q}x ${data.n}.`,
    });
  }

  return null;
}

module.exports = handler;
