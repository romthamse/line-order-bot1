# Deploying your LINE Order Bot — step by step

No coding experience needed. This takes about 20-30 minutes the first time.
You'll set up four things, in this order: (1) a LINE bot channel, (2) a
Google Sheet the bot can write to, (3) the code hosted on Vercel, (4) wiring
them together and inviting the bot into your group.

---

## Part 1 — Create the LINE bot

A LINE bot always lives on a "channel" inside a LINE Official Account. This
does **not** make it public — you control who ever adds it or invites it
anywhere, so it can live entirely inside your one private group.

1. Go to **https://developers.line.biz/console/** and log in with your
   regular LINE account (or create one).
2. Click **Create a new provider** — give it any name (e.g. "Rom Personal").
3. Inside the provider, click **Create a new channel** → choose
   **Messaging API**.
4. Fill in the required fields (channel name, description, category — pick
   anything reasonable, e.g. "Food ordering bot" / "Other"). Agree to the
   terms and create it.
5. Open the new channel. Under the **Messaging API** tab:
   - Note the **Channel secret** (also on the "Basic settings" tab) —
     you'll need this later.
   - Scroll to **Channel access token** → click **Issue** → copy the long
     token shown. This is your `LINE_CHANNEL_ACCESS_TOKEN`.
   - Turn **Use webhook** to **On**.
   - Under **LINE Official Account features**, turn **OFF** both
     "Auto-reply messages" and "Greeting messages" (these are LINE's
     built-in canned replies — you want only your bot code responding).
6. On the same page, find the **QR code** — this is how you'll add the bot
   as a friend and invite it into your group later. Leave this tab open or
   save the QR code image for now.

You now have: `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_CHANNEL_SECRET`. Keep
them somewhere safe — you'll paste them into Vercel in Part 3.

---

## Part 2 — Create the Google Sheet and its service account

The bot writes confirmed orders to a Google Sheet using a "service
account" — essentially a robot Google account that only has access to the
one sheet you explicitly share with it.

1. Go to **https://console.cloud.google.com/** and create a new project (or
   use an existing one) — any name is fine.
2. In the search bar, search for **Google Sheets API** and click **Enable**.
3. In the left menu, go to **IAM & Admin → Service Accounts** → **Create
   Service Account**. Give it any name (e.g. "line-order-bot"). You can skip
   the optional permission-granting steps — click through to **Done**.
4. Click into the service account you just created → **Keys** tab →
   **Add Key → Create new key → JSON**. This downloads a `.json` file —
   keep it safe, you'll need two values from inside it:
   - `client_email` → this is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → this is your `GOOGLE_PRIVATE_KEY` (a long block of
     text starting with `-----BEGIN PRIVATE KEY-----`)
5. Create a new Google Sheet (sheets.new). Rename the first tab to
   **Orders** (must match `SHEET_NAME` below, or change one to match the
   other). Add a header row: `Timestamp | Group | Requester | Product |
   Quantity | Total | Status`.
6. Click **Share** on the sheet → paste in the `client_email` from step 4 →
   give it **Editor** access → Send (it's fine that it's a robot account,
   ignore any warning about it not being a real person).
7. Copy the Sheet's ID from its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_ID`**`/edit`
   — this is your `GOOGLE_SHEET_ID`.

You now have: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`,
`GOOGLE_SHEET_ID`, and `SHEET_NAME` (`Orders`).

---

## Part 3 — Deploy the code to Vercel

1. Create a free account at **https://github.com** if you don't have one.
2. Create a new, empty repository (e.g. `line-order-bot`).
3. Upload every file from this project into that repository (GitHub's web
   UI lets you drag-and-drop files with "Add file → Upload files" — you
   don't need git installed).
4. Go to **https://vercel.com**, sign up/log in (you can use your GitHub
   account to sign in — this also makes importing easier).
5. Click **Add New → Project**, choose **Import Git Repository**, and pick
   the repository you just created.
6. Before clicking Deploy, open **Environment Variables** and add all six:
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (paste the whole key including the
     `-----BEGIN...-----`/`-----END...-----` lines)
   - `GOOGLE_SHEET_ID`
   - `SHEET_NAME` → `Orders`
7. Click **Deploy**. Once it finishes, Vercel shows you a URL like
   `https://line-order-bot-yourname.vercel.app`.

Your webhook address is that URL plus `/api/webhook`, e.g.:
`https://line-order-bot-yourname.vercel.app/api/webhook`

---

## Part 4 — Connect LINE to your deployment

1. Back in the LINE Developers Console (Part 1), open your channel's
   **Messaging API** tab.
2. Paste your webhook address (ending in `/api/webhook`) into the
   **Webhook URL** field → click **Update**, then **Verify** — it should
   say Success. (If it fails, double check the URL and that Vercel finished
   deploying.)
3. Add the bot as a friend by scanning its QR code (Part 1, step 6) with
   your phone's LINE app.
4. Open your target private group chat in LINE → tap the group name →
   **Invite** → find and add the bot by name.

That's it — the bot is now a quiet member of your group.

---

## Testing it

In the group chat, type something like `pad thai x2`. You should get a
reply card with **Confirm** / **Cancel** buttons within a couple of seconds.
Tap Confirm and check that a new row appears in your Google Sheet. Ordinary
messages ("see you at 7", "thanks!") should get no response at all — that's
expected, it's listening passively.

---

## Customizing the keyword/product list

Open `config/products.json` in your GitHub repository, edit it (GitHub lets
you edit files directly in the browser — pencil icon), and commit the
change. Vercel automatically redeploys within a minute or two. See the main
`README.md` for the format.

## Troubleshooting

- **Webhook verify fails in LINE console** — make sure "Use webhook" is
  turned on, and that the URL ends in `/api/webhook` exactly.
- **Bot doesn't respond in the group** — confirm "Auto-reply messages" and
  "Greeting messages" are OFF, and that the bot was actually invited into
  the group (not just added as a 1:1 friend).
- **Confirm button replies with an error / nothing happens** — double
  check the four Google env vars in Vercel, especially that
  `GOOGLE_PRIVATE_KEY` was pasted in full, and that the sheet was shared
  with the service account's exact email as Editor.
- **Wrong tab name error from Sheets** — `SHEET_NAME` must exactly match
  the sheet tab's name (case-sensitive).
