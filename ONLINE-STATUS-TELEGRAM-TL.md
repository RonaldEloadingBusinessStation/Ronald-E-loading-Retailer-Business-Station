# Online / Offline status via Telegram

- The retailer dashboard Contact Ronald section now shows a live green ONLINE or red OFFLINE indicator.
- The page refreshes status every 15 seconds from `GET /api/availability`.
- The authorized Telegram admin bot menu now includes `SET ONLINE` and `SET OFFLINE` buttons.
- Status is stored in PostgreSQL (`eloading_availability`) and persists across server restarts.

## Render environment
The existing admin bot must be configured:
- `DATABASE_URL`
- `TELEGRAM_ADMIN_BOT_TOKEN` (the private admin bot token)
- `TELEGRAM_CHAT_ID` (admin's Telegram chat ID), or `TELEGRAM_ADMIN_USER_ID`

The project already uses `TELEGRAM_ADMIN_BOT_TOKEN` for private admin controls. The regular customer notification bot token is separate and is not sufficient for the admin buttons.

After uploading the updated project and deploying, open the private admin bot and send `/start` or `/panel`. Use the green or red buttons in its menu.

If PostgreSQL (`DATABASE_URL`) is not configured, the public indicator safely defaults to OFFLINE.
