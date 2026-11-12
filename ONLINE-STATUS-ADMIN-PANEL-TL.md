# Online / Offline status update

Mga binago:
- `retailer.html`: ang public Contact Ronald status ay kumokonekta na sa Render API at maayos na ang status text.
- `retailer.css`: mas malinaw na green/red status light sa mobile at desktop.
- `server.js`: nagdagdag ng secured `POST /api/admin/availability` endpoint at ON/OFF controls sa `/admin`.

## Paano gamitin
1. I-deploy ang updated repository sa Render.
2. I-set ang `DATABASE_URL` at `ADMIN_KEY` sa Render Environment.
3. Buksan ang `https://ronald-e-loading-retailer-business.onrender.com/admin`.
4. I-enter ang private `ADMIN_KEY`, pagkatapos gamitin ang **SET ONLINE** o **SET OFFLINE**.
5. I-refresh ang public website. Kusang magre-refresh ang status kada 15 segundo.

Ang Telegram ON/OFF buttons ay gumagamit pa rin ng parehong database status. Siguraduhing naka-configure ang Telegram bot token at authorized admin chat ID. Huwag ilagay ang `ADMIN_KEY` sa GitHub o public frontend files.
