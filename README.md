# Ronald E-Loading — Telegram Notifications

This version sends website order submissions to your Telegram chat through a Telegram Bot.

## IMPORTANT SECURITY
Do NOT put your Telegram bot token in `index.html`, `script.js`, or any public GitHub repository.
The bot token belongs only in `.env`.

If a bot token was posted publicly or shared in a chat, revoke it with BotFather and create a new token.

## Setup

1. Install Node.js.
2. Open this folder in VS Code.
3. Run:
   `npm install`
4. Copy `.env.example` to `.env`.
5. Put your NEW Telegram bot token in:
   `TELEGRAM_BOT_TOKEN=`
6. Put your Telegram personal chat ID in:
   `TELEGRAM_CHAT_ID=`
7. Start:
   `npm start`
8. Open:
   `http://localhost:3000`

## How to get the Chat ID

Using your Telegram personal account:
1. Open your new bot.
2. Press Start / send `/start` to the bot.
3. Use a Telegram bot such as `@userinfobot` to view your own Telegram user/chat ID, or use your bot's `getUpdates` endpoint after sending `/start`.
4. Put that numeric ID in `.env`.

The notification is sent to the configured chat ID. The customer does not receive the Telegram notification unless you explicitly configure their chat ID.

## Notification format

The Telegram notification includes the order number, customer name, mobile number, network, promo, amount, payment method, and reference number. If a payment screenshot is uploaded, the actual image is sent to Telegram as a photo.

Payment screenshots are sent to the configured Telegram chat as actual Telegram photos and are also temporarily stored in the local `uploads/` folder.

## Hosting

This project needs a Node.js-capable host because `server.js` handles the Telegram API call. A static-only host such as GitHub Pages cannot run the server.


## Permanent order history and customer push notifications

This version adds opt-in Web Push notifications and PostgreSQL-backed order storage. For persistent orders on Render, configure `DATABASE_URL` on the **original loading backend service** (not the retailer portal). Without `DATABASE_URL`, it falls back to `orders-status.json`, which is not guaranteed to survive Render restarts/redeploys.

### Required Render environment variables
- `DATABASE_URL`: connection string for a PostgreSQL database. Use the database URL from the PostgreSQL service and ensure the database is reachable by the backend.
- `VAPID_PUBLIC_KEY`: public Web Push VAPID key.
- `VAPID_PRIVATE_KEY`: private Web Push VAPID key (keep secret; never put it in the website/GitHub Pages).
- `VAPID_SUBJECT`: e.g. `mailto:petiloronald82@gmail.com`.

Generate a VAPID key pair locally with `npx web-push generate-vapid-keys` after installing dependencies. Add both generated values to Render environment variables. Keep the private key secret.

### How customers receive alerts
Customers must open the website over HTTPS, tap **ALLOW NOTIFICATIONS**, and allow the browser permission. After they place an order on that same browser/device, the subscription is linked to that order. When the admin marks the order `COMPLETED` after uploading the main receipt, the backend sends a push alert to that subscribed device. Browser/device support and notification settings can affect delivery.

### Important
- The static site must include `service-worker.js` at the website root (same origin as the website, such as GitHub Pages).
- The API base URL in `script.js` currently points to `https://online-loading-website.onrender.com`. Change it only if the original loading backend URL changes.
- Push notifications require PostgreSQL because subscriptions must persist between server restarts.

---

## Retailer portal (added)

Open `/retailer` on the same deployed server. Retailers can self-register, sign in, submit loading orders, request wallet top-ups, and review their order/top-up/ledger history. New accounts start at **₱0.00**.

### Required deployment configuration

1. Attach a persistent PostgreSQL database to the Render web service and set `DATABASE_URL`.
2. Set `ADMIN_KEY` to a long random secret in Render Environment. Do not put it in `retailer.html`, `retailer.js`, GitHub, or any public file.
3. Keep `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` set for notifications. Top-up requests include the uploaded receipt in the configured Telegram chat when Telegram is available.
4. Deploy the folder as a Node web service using `npm install` and `npm start`. Do not deploy it as a static-only site.
5. Visit `/retailer` to register a test account.

### Wallet and order rules

- A retailer's wallet starts at ₱0.00.
- A top-up receipt creates a **PENDING** request. The wallet increases only after an admin approves it.
- An order is submitted as **PROCESSING**. It does not immediately debit the wallet. Pending orders count against the balance available for placing additional orders to avoid knowingly overbooking the wallet.
- The admin must actually load the customer successfully before selecting **Mark completed**. The server then atomically debits the wallet and records a ledger entry. A repeated completion cannot debit the same order twice. Rejected orders do not debit the wallet.
- Admin approval, rejection, order completion, and manual wallet adjustments require the private `ADMIN_KEY` in the request header. The retailer browser asks for this key only when the Admin tab is opened; it is not saved to the project files.
- Passwords are stored as salted scrypt hashes. Sessions use HttpOnly cookies and expire after seven days.

### Notes

- The QR images and existing brand/network assets are reused from the supplied ZIP. Verify each QR/account recipient and the current payment details before accepting live payments.
- The retailer portal's admin tab is intended for the owner. Share the `ADMIN_KEY` with nobody. Use HTTPS in production.
- If `DATABASE_URL` is missing, retailer features fail closed rather than storing account balances in temporary Render filesystem storage.
- Manual loading is the current workflow; no telecom/retailer provider API is integrated.
