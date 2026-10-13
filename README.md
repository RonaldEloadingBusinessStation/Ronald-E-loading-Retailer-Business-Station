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

### Telegram retailer admin controls
- New retailer registrations send the retailer ID, store name, username, and created time to the configured Telegram chat. Passwords are never sent; the database stores a salted password hash.
- Order and top-up notifications show only one **🛠 ADMIN PANEL** button. The button opens the website admin page at `/admin`, where you can review/approve/reject top-ups, complete/reject retailer orders, view retailer balances, and add/deduct wallet balance. Telegram stays uncluttered; manage requests on the website admin page.
- Protect the admin page with `ADMIN_KEY`, configured only in Render environment variables. The page asks for the key and sends it in a request header; it is not placed in the page URL. Use a long random secret and do not share it with retailers.
- `ADMIN_PANEL_BASE_URL` optionally sets the base URL used by the Telegram button. It defaults to `RENDER_EXTERNAL_URL` when available, otherwise `https://ronald-e-loading-retailer-business.onrender.com`.
- Legacy Telegram admin commands remain in the backend, but the notification button now opens the website admin panel. Keep `TELEGRAM_CHAT_ID` and `TELEGRAM_ADMIN_USER_ID` configured to restrict Telegram commands/actions.
