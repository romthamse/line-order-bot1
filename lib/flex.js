/**
 * Builds the LINE Flex Message shown in-chat when an order is detected.
 * Confirm/Cancel are postback buttons — the order details travel inside
 * the postback `data` payload itself (short keys to stay under LINE's
 * 300-byte postback data limit), so no external state store is needed
 * between "order detected" and "order confirmed".
 */
function buildConfirmMessage(order) {
  const basePayload = {
    p: order.productId,
    n: order.productName,
    q: order.quantity,
    pr: order.price || 0,
    u: order.userId || '',
    d: order.userName || 'Someone',
    g: order.groupId || '',
  };

  const confirmPayload = JSON.stringify({ ...basePayload, a: 'confirm' });
  const cancelPayload = JSON.stringify({ ...basePayload, a: 'cancel' });

  const totalLine = order.price
    ? `${order.quantity} x ${order.price} = ${order.quantity * order.price} THB`
    : null;

  const bodyContents = [
    { type: 'text', text: 'Order detected', weight: 'bold', size: 'lg', color: '#B22222' },
    { type: 'text', text: `${order.quantity} x ${order.productName}`, wrap: true, margin: 'md', size: 'md' },
  ];

  if (totalLine) {
    bodyContents.push({ type: 'text', text: totalLine, size: 'sm', color: '#555555', margin: 'sm' });
  }

  bodyContents.push({
    type: 'text',
    text: `Requested by ${order.userName || 'Someone'}`,
    size: 'sm',
    color: '#888888',
    margin: 'md',
  });

  return {
    type: 'flex',
    altText: `Order detected: ${order.quantity}x ${order.productName} — confirm in chat`,
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
              displayText: `Confirmed: ${order.quantity}x ${order.productName}`,
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
