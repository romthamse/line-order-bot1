# LINE Order Bot

A LINE bot that sits quietly in a private group chat, watches messages go by,
and — only when someone mentions a product it recognizes (e.g. "pad thai
x2") — replies in-chat with a **Confirm / Cancel** card. Confirming logs the
order as a new row in a Google Sheet everyone can already see.

It never messages the group on its own and never reacts to anything that
isn't order-shaped — everything else just passes through unnoticed.

**Start here:** [`DEPLOY.md`](./DEPLOY.md) — a full, non-technical, step by
step walkthrough from "I have nothing yet" to "the bot is live in my group."

## How it works

1. LINE forwards every message sent in the group to this bot's webhook
   (`api/webhook.js`), since the bot is a member of the group.
2. `lib/parseOrder.js` checks the message text against the keyword list in
   `config/products.json`. No match → nothing happens.
3. On a match, `lib/flex.js` builds a Flex Message with the detected
   product/quantity and Confirm/Cancel buttons, sent back as a reply.
4. Tapping Confirm sends a "postback" back to the webhook, which appends a
   row to your Google Sheet via `lib/sheets.js`. Tapping Cancel just
   acknowledges and does nothing further.

## What it currently listens for

Only three items, each a 20-liter keg:

| Product | Example messages that trigger it |
|---|---|
| Lager | `ลาเกอร์ x 2`, `lager 3` |
| Rose | `โรเซ่ 20L 4 ถัง`, `rose x1` |
| Dunkel | `Dunkel 1`, `dunkel x 2` |

Quantity is read from an explicit `x N`, a `N ถัง` ("N kegs") count, or a
bare trailing number — the `20L` capacity mention is deliberately ignored
so it's never mistaken for a quantity. No number at all defaults to 1 keg.
Prices (2,300 THB for Lager, 2,500 THB for Rose and Dunkel) are prefilled
to match Tawandang's existing keg pricing — double check these are still
current and edit `config/products.json` if not.

## Customizing what counts as an order

Edit `config/products.json` — add, remove, or rename entries; each has an
`id`, a display `name`, a list of `keywords` to match (any case, Thai or
English), and an optional `price` used to compute a total. Commit and push
the change and Vercel redeploys automatically.

## Local testing

```
npm install
npm test
```

`npm test` runs `test/parseOrder.test.js`, which checks the keyword/quantity
matching logic without needing a live LINE channel or Google Sheet.
