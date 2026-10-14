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

### Separate Telegram notification and admin bots
- `TELEGRAM_BOT_TOKEN` is the **notification-only bot**. It sends new retailer registration alerts, new public website order notifications, retailer load order notifications, wallet top-up requests (including submitted proof where available), and transaction record messages after admin actions. It does not process admin commands or approve/deduct buttons.
- `TELEGRAM_CHAT_ID` is the destination chat ID for notification messages. Keep the notification bot in the configured destination and do not use its token for admin controls.
- `TELEGRAM_ADMIN_BOT_TOKEN` is the **admin-only bot**. Press **Start** in its private chat to immediately show the Admin Panel menu; new account, website-order, retailer-load-order, and top-up alerts also include panel buttons. The commands menu is configured automatically. Its menu manages pending top-ups (including proof when the uploaded file is available), retailer load orders, public website orders and main-receipt uploads, retailer balances, and the website admin panel.
- This version keeps the five Render variables you already use; it does not require `TELEGRAM_ADMIN_USER_ID`. For secure admin authorization, `TELEGRAM_CHAT_ID` must be your numeric PRIVATE Telegram chat/user ID (not a group chat ID). The admin bot only accepts commands, receipt uploads, and button actions from that matching account in a private chat.
- `/wallet RET-12 +500 verified payment` adds balance; `/wallet RET-12 -50 correction` deducts balance. Both actions create a wallet-ledger entry, block negative balances, and send a transaction record to the notification bot.
- Both bots use the existing backend and database. Keep the existing `DATABASE_URL`, `ADMIN_KEY`, notification bot token, and other configured credentials. Add the admin bot token as a separate Render environment variable; do not replace the notification token.
- `ADMIN_PANEL_BASE_URL` optionally sets the website admin URL. Protect the website admin panel with `ADMIN_KEY`; never put that key in GitHub or a Telegram button URL.


## Retailer push notifications (no Firebase)
- The retailer dashboard includes an **Enable notifications** button. Retailers must sign in and grant browser notification permission.
- Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in the existing Render service environment. Do not replace `DATABASE_URL` or existing secrets. Generate keys using `npx web-push generate-vapid-keys`; keep the private key secret.
- Server push alerts are triggered for retailer top-up pending/successful and load pending/successful status changes. Existing PostgreSQL tables are preserved; startup adds only a nullable `retailer_user_id` column to the existing push-subscriptions table.
- Web Push works in supported browsers when permission is granted; device/browser restrictions apply. **This source update does not yet implement native Android background notifications inside the APK.** The Android APK must be separately rebuilt with a native background notification mechanism to guarantee alerts when the app is backgrounded.
- No Firebase is used. Do not publish until Render VAPID settings and browser tests are complete.
