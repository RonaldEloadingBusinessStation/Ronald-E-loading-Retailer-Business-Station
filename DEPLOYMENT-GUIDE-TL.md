# Ronald E-Loading Retailer Portal — Deployment Guide

This package is prepared for connecting to your existing live Ronald E-Loading website.

## Important: your private keys are NOT included
This ZIP intentionally does not contain real admin keys, database URLs, Telegram bot tokens, or chat IDs. Add those in your hosting provider's private Environment Variables settings. Never publish them in frontend JavaScript, a public repository, screenshots, or chat messages.

## Configure your existing deployment
1. Back up your current live site and database before deploying.
2. Upload this project to your existing private source repository, or deploy the extracted folder using your current Node.js hosting workflow.
3. Keep the existing domain and update the existing service only after reviewing the current app's routes and database schema.
4. Configure only the variables actually read by this project's `server.js` / `.env.example`:
   - `DATABASE_URL` — PostgreSQL connection string
   - `ADMIN_KEY` — long, random private admin secret
   - `TELEGRAM_BOT_TOKEN` — optional Telegram bot token
   - `TELEGRAM_CHAT_ID` — optional Telegram destination chat ID
5. Check that the host's Node.js version and start command match `package.json`.
6. Deploy to a staging service first if available. Verify retailer registration/login, admin authentication, top-up approvals, order status updates, wallet ledger, and Telegram notifications before production.
7. Confirm the existing domain, HTTPS, and database migrations still work before routing real retailer traffic.

## Environment variable template
Use `.env.example` as the source of truth for this project's actual variable names. Do not paste real values into this file or commit a `.env` file.

## Wallet and order safety
- Confirm top-up receipts manually before crediting funds.
- Keep an auditable ledger for every credit/debit.
- Use database transactions and idempotency checks for approvals and order completion.
- Do not enable real-money production use until wallet balance changes and admin permissions have been tested.

## Notes
This guide does not claim that the project has been deployed or that the existing live site has been changed. The project must be inspected and tested against your existing live deployment and database schema before production.


## Bagong entry link: Create Retailer Account muna

Ang `index.html` ay naka-redirect na sa Render retailer registration page (`/retailer?mode=register`). Ang dating public homepage ay pinanatili sa `public.html`. Sa retailer page, ang “Public website” link ay papunta sa `/public.html`. I-deploy ang parehong files sa Render at i-push ang repository updates sa GitHub Pages. Siguraduhing available ang Render service at naka-configure ang PostgreSQL `DATABASE_URL`.


## Mananatiling naka-login ang retailer
Ang retailer session ay naka-set sa hanggang 365 araw. Mananatiling naka-login sa parehong browser/device hangga’t hindi pinipindot ang **Logout**, hindi nililinis ang browser cookies/site data, at hindi binabawi o ine-expire ng server ang session. Para sa seguridad, mag-Logout sa shared/public na device.
