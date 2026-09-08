const { formatDateCompact, formatDateDisplay } = require('./parseOrder');

/**
 * A short, time-based id shared by both buttons on one confirmation card.
 * LINE has no way to edit or disable a message once it's sent \u2014 the
 * Confirm/Cancel buttons stay visually clickable forever \u2014 so this id is
 * how the server tells a genuine first tap apart from someone tapping
 * Confirm a second time on the same card: it gets written to the sheet
 * alongside the order, and checked for before writing again.
 */
function generateOrderId() {
  return Date.now().toString(36);
}

/**
 * Builds the LINE Flex Message shown in-chat when one or more orders are
 * detected in a single message. Confirm/Cancel are postback buttons \u2014 the
 * order details travel inside the postback `data` payload itself. Keys are
 * kept short (i/o/p/q/t/d/n) and both names are capped at 20 characters
 * (LINE's own display-name limit anyway) to stay comfortably under LINE's
 * 300-byte postback data limit even with 3 dated items and two long names.
 */
function buildConfirmMessage(orders, meta) {
  const { userName, chatName } = meta || {};
  const orderId = generateOrderId();

  const items = orders.map((o) => ({
    p: o.productId,
    q: o.quantity,
    t: formatDateCompact(o.date),
  }));

  const safeUserName = (userName || 'Someone').slice(0, 20);
  const safeChatName = (chatName || '').slice(0, 20);

  const confirmPayload = JSON.stringify({
    a: 'confirm',
    i: orderId,
    o: items,
    d: safeUserName,
    n: safeChatName,
  });
  const cancelPayload = JSON.stringify({ a: 'cancel', i: orderId });

  const grandTotal = orders.reduce(
    (sum, o) => sum + (o.price ? o.price * o.quantity : 0),
    0
  );

  const summary = orders.map((o) => `${o.quantity}x ${o.productName}`).join(', ');

  const itemLines = orders.map((o) => {
    const lineTotal = o.price ? ` \u2014 ${o.quantity * o.price} THB` : '';
    const dateSuffix = o.explicitDate ? ` (for ${formatDateDisplay(o.date)})` : '';
    return {
      type: 'text',
      text: `${o.quantity} x ${o.productName}${dateSuffix}${lineTotal}`,
      wrap: true,
      margin: 'sm',
      size: 'md',
    };
  });

  const bodyContents = [
    {
      type: 'text',
      text: orders.length > 1 ? 'Orders detected' : 'Order detected',
      weight: 'bold',
      size: 'lg',
      color: '#B22222',
    },
    ...itemLines,
  ];

  if (grandTotal > 0) {
    bodyContents.push({
      type: 'text',
      text: `Total: ${grandTotal} THB`,
      size: 'sm',
      color: '#555555',
      margin: 'md',
      weight: 'bold',
    });
  }

  if (chatName) {
    bodyContents.push({
      type: 'text',
      text: `From: ${chatName}`,
      size: 'sm',
      color: '#888888',
      margin: 'md',
    });
  }

  bodyContents.push({
    type: 'text',
    text: `Requested by ${userName || 'Someone'}`,
    size: 'sm',
    color: '#888888',
    margin: chatName ? 'xs' : 'md',
  });

  return {
    type: 'flex',
    altText: `Order detected: ${summary} \u2014 confirm in chat`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: bodyContents,
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#2E7D32',
            action: {
              type: 'postback',
              label: 'Confirm',
              data: confirmPayload,
              displayText: `Confirmed \u0e04\u0e2d\u0e19\u0e40\u0e1f\u0e34\u0e23\u0e4c\u0e21\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23 : ${summary}`,
            },
          },
          {
            type: 'button',
            style: 'secondary',
            action: {
              type: 'postback',
              label: 'Cancel',
              data: cancelPayload,
              displayText: 'Order cancelled',
            },
          },
        ],
      },
    },
  };
}

module.exports = { buildConfirmMessage };
