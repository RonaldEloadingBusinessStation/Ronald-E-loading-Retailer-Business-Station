const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const webpush = require("web-push");
const { Pool } = require("pg");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from GitHub Pages
app.use(cors());

const UPLOAD_DIR = path.join(__dirname, "uploads");

fs.mkdirSync(UPLOAD_DIR, {
  recursive: true
});

const upload = multer({
  dest: UPLOAD_DIR,

  limits: {
    fileSize: 10 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png"
    ];

    const allowed =
      allowedTypes.includes(file.mimetype);

    if (!allowed) {
      return cb(
        new Error(
          "Payment screenshot must be JPG/JPEG/PNG."
        )
      );
    }

    cb(null, true);
  }
});

// Keep private uploads and order data out of the public static file server.
app.use(['/uploads', '/orders-status.json', '/orders.log'], (req, res) => res.sendStatus(404));
app.use(express.static(__dirname));

const clean = (value) =>
  decodeURIComponent(String(value ?? ""))
    .trim()
    .slice(0, 1000);

const ORDERS_FILE = path.join(__dirname, "orders-status.json");
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
}) : null;
let dbReady = false;
async function initDatabase() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS eloading_orders (order_number TEXT PRIMARY KEY, record JSONB NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS eloading_push_subscriptions (endpoint TEXT PRIMARY KEY, order_number TEXT NOT NULL DEFAULT '', subscription JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  // One-time safe import of any legacy JSON orders not yet present in PostgreSQL.
  try {
    const legacy = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    for (const [orderNumber, record] of Object.entries(legacy || {})) {
      await pool.query(`INSERT INTO eloading_orders(order_number, record) VALUES($1, $2::jsonb) ON CONFLICT(order_number) DO NOTHING`, [orderNumber, JSON.stringify(record)]);
    }
  } catch (_) { /* No legacy file yet is normal for a fresh deployment. */ }
  dbReady = true;
  console.log("PostgreSQL order history and push subscriptions are ready.");
}
async function readOrders() {
  if (pool) {
    if (!dbReady) await initDatabase();
    const result = await pool.query("SELECT order_number, record FROM eloading_orders");
    return Object.fromEntries(result.rows.map(row => [row.order_number, row.record]));
  }
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); }
  catch { return {}; }
}
async function writeOrders(orders) {
  if (pool) {
    if (!dbReady) await initDatabase();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [orderNumber, record] of Object.entries(orders)) {
        await client.query(`INSERT INTO eloading_orders(order_number, record) VALUES($1, $2::jsonb) ON CONFLICT(order_number) DO UPDATE SET record = EXCLUDED.record`, [orderNumber, JSON.stringify(record)]);
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
    return;
  }
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:petiloronald82@gmail.com", vapidPublicKey, vapidPrivateKey);
}
async function sendOrderPush(order) {
  if (!pool || !vapidPublicKey || !vapidPrivateKey) return;
  const result = await pool.query("SELECT endpoint, subscription FROM eloading_push_subscriptions WHERE order_number = $1", [order.orderNumber]);
  const payload = JSON.stringify({ title: "RONALD E-LOADING BUSINESS STATION", body: `Your order ${order.orderNumber} has been successfully completed.`, orderNumber: order.orderNumber, url: "/#track-order" });
  for (const row of result.rows) {
    try { await webpush.sendNotification(row.subscription, payload); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await pool.query("DELETE FROM eloading_push_subscriptions WHERE endpoint = $1", [row.endpoint]);
      else console.error("Web push send failed:", e.message);
    }
  }
}
function manilaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value || "";
  return {
    date: `${get("month")} ${get("day")}, ${get("year")}`,
    time: `${get("hour")}:${get("minute")} ${get("dayPeriod")}`
  };
}
function manilaDateTime(date = new Date()) {
  const p = manilaParts(date);
  return `${p.date} ${p.time}`;
}
function adminAuthorized(req) {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  return String(req.headers["x-admin-key"] || req.query.key || req.body?.key || "") === key;
}

// ===============================
// TELEGRAM CONFIG
// ===============================

function getTelegramConfig() {
  const token =
    process.env.TELEGRAM_BOT_TOKEN;

  const chatId =
    process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error(
      "Telegram is not configured. Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID."
    );
  }

  return {
    token,
    chatId
  };
}

// ===============================
// ORDER MESSAGE
// ===============================

function makeMessage(body) {
  const orderType = clean(body["Order Type"] || body["OrderType"] || "");
  const network = clean(body["Network Selected"] || body["Network"] || "");
  const isMLBB = orderType.toLowerCase() === "mlbb top up" || network.toLowerCase() === "mlbb";
  const customer = clean(body["Customer Name"] || body["Customer"] || body["Name"] || "");
  const userId = clean(body["MLBB User ID"] || body["User ID"] || body["userId"] || "");
  const zoneId = clean(body["MLBB Zone ID"] || body["Zone ID"] || body["zoneId"] || "");

  return [
    "🔔 NEW RONALD E-LOADING ORDER",

    `Order No.: ${clean(
      body["Order Number"]
    )}`,

    `Customer: ${clean(body["Customer Name"] || body["Customer"] || body["Name"])}`,

    ...(body["Order Type"] === "MLBB Top Up" || body["Network"] === "MLBB" ? [] : [
      `Mobile: ${clean(body["Mobile Number"] || body["Mobile"])}`
    ]),

    `Order Type: ${((String(body["Order Type"] || "").toLowerCase().includes("mlbb") || String(body["Network"] || "").toLowerCase() === "mlbb") ? "ML" : "Loading")}`,

    `Network: ${clean(
      body["Network Selected"] ||
      body["Network"]
    )}`,

    ...(body["Order Type"] === "MLBB Top Up" || body["Network"] === "MLBB" ? [
      `User ID: ${clean(body["MLBB User ID"] || body["User ID"])}`,
      `Zone ID: ${clean(body["MLBB Zone ID"] || body["Zone ID"])}`
    ] : []),

    `Promo: ${clean(
      body["Promo Selected"] ||
      body["Promo"]
    )}`,

    `Amount: ${clean(
      body["Amount"]
    )}`,

    `Payment: ${clean(
  body["Payment Method"]
)}`,

`Time: ${new Date().toLocaleString("en-PH", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit",
  hour12: true
})}`,

`Reference: ${
      clean(body["Reference Number"]) ||
      "N/A"
    }`

  ].join("\n");
}

// ===============================
// TELEGRAM REQUEST
// ===============================

async function telegramRequest(
  method,
  formData
) {
  const { token } =
    getTelegramConfig();

  const url =
    `https://api.telegram.org/bot${token}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    body: formData
  });

  const data =
    await response
      .json()
      .catch(() => ({}));

  if (
    !response.ok ||
    !data.ok
  ) {
    throw new Error(
      `Telegram API error (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

// ===============================
// SEND TELEGRAM MESSAGE
// ===============================

async function sendTelegramMessage(text, replyMarkup = null) {
  const { chatId } =
    getTelegramConfig();

  const form =
    new FormData();

  form.append(
    "chat_id",
    chatId
  );

  form.append(
    "text",
    text
  );

  form.append(
    "disable_web_page_preview",
    "true"
  );

  if (replyMarkup) {
    form.append("reply_markup", JSON.stringify(replyMarkup));
  }

  return telegramRequest(
    "sendMessage",
    form
  );
}

// ===============================
// SEND PAYMENT SCREENSHOT
// ===============================

async function sendTelegramPhoto(
  filePath,
  originalName,
  mimeType,
  caption,
  replyMarkup = null
) {
  const { chatId } =
    getTelegramConfig();

  const buffer =
    fs.readFileSync(filePath);

  const blob =
    new Blob(
      [buffer],
      { type: mimeType }
    );

  const form =
    new FormData();

  form.append(
    "chat_id",
    chatId
  );

  form.append(
    "photo",
    blob,
    originalName ||
    "payment-screenshot.jpg"
  );

  form.append(
    "caption",
    caption.slice(0, 1024)
  );

  if (replyMarkup) {
    form.append("reply_markup", JSON.stringify(replyMarkup));
  }

  try {
    return await telegramRequest(
      "sendPhoto",
      form
    );
  } catch (error) {
    // Telegram can reject some valid-looking uploads with IMAGE_PROCESS_FAILED.
    // Retry as a document so the customer's payment screenshot is still delivered.
    if (!String(error.message).includes("IMAGE_PROCESS_FAILED")) {
      throw error;
    }

    const documentForm = new FormData();
    documentForm.append("chat_id", chatId);
    documentForm.append(
      "document",
      new Blob([buffer], { type: mimeType || "application/octet-stream" }),
      originalName || "payment-screenshot"
    );
    documentForm.append("caption", caption.slice(0, 1024));

    if (replyMarkup) {
      documentForm.append("reply_markup", JSON.stringify(replyMarkup));
    }

    return telegramRequest("sendDocument", documentForm);
  }
}

// ===============================
// TELEGRAM RECEIPT + COMPLETED FLOW
// ===============================

function receiptUploadKeyboard(orderNumber) {
  return {
    inline_keyboard: [[
      { text: "📎 UPLOAD RECEIPT", callback_data: `receipt_help:${orderNumber}` }
    ]]
  };
}

function completedKeyboard(orderNumber) {
  return {
    inline_keyboard: [[
      { text: "✅ COMPLETED", callback_data: `complete:${orderNumber}` }
    ]]
  };
}

function completedMessage(order) {
  const f = order.fields || {};
  const isMLBB = String(f["Order Type"] || "").toLowerCase().includes("mlbb") || String(f["Network"] || "").toLowerCase() === "mlbb";
  const successful = order.successfulTime || "";
  return [
    "🟢 ORDER COMPLETED",
    `Order No.: ${order.orderNumber}`,
    `Customer: ${clean(f["Customer Name"])}`,
    `Order Type: ${isMLBB ? "ML" : "Loading"}`,
    `Network: ${clean(f["Network Selected"] || f["Network"])}`,
    ...(isMLBB ? [`User ID: ${clean(f["MLBB User ID"])}`, `Zone ID: ${clean(f["MLBB Zone ID"])}`] : [`Mobile: ${clean(f["Mobile Number"])}`]),
    `Promo: ${clean(f["Promo Selected"] || f["Promo"])}`,
    `Amount: ${clean(f["Amount"])}`,
    `Payment: ${clean(f["Payment Method"])}`,
    `Order Time: ${order.orderTime}`,
    `Status: COMPLETED`,
    `Successful Time: ${successful}`,
    `🧾 Main receipt: attached above/below in this Telegram chat.`
  ].join("\n");
}

async function markOrderCompleted(orderNumber) {
  const orders = await readOrders();
  const key = clean(orderNumber);
  const order = orders[key];
  if (!order) throw new Error("Order not found.");
  if (!order.receiptUploaded) throw new Error("Upload the MAIN RECEIPT first, then confirm the order.");
  if (order.status !== "COMPLETED") {
    order.status = "COMPLETED";
    order.successfulTime = manilaDateTime(new Date());
    await writeOrders(orders);
    await sendOrderPush(order);
  }
  return order;
}

function extractOrderNumberFromCaption(caption) {
  const m = String(caption || "").match(/\b(?:REL|MLT)-\d{8}-\d{4,}\b/i);
  return m ? m[0].toUpperCase() : "";
}

async function downloadTelegramFile(fileId, destination) {
  const { token } = getTelegramConfig();
  const fileForm = new FormData();
  fileForm.append("file_id", fileId);
  const result = await telegramRequest("getFile", fileForm);
  const filePath = result.result.file_path;
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!response.ok) throw new Error("Unable to download Telegram receipt.");
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return filePath;
}

async function handleTelegramReceipt(message) {
  const { chatId } = getTelegramConfig();
  if (String(message?.chat?.id) !== String(chatId)) return;
  if (!message.photo?.length) return;
  const orderNumber = extractOrderNumberFromCaption(message.caption);
  if (!orderNumber) {
    await sendTelegramMessage("📎 Receipt photo received, but I could not find the Order Number. Send it again with the caption: RECEIPT REL-YYYYMMDD-XXXX");
    return;
  }
  const orders = await readOrders();
  const order = orders[orderNumber];
  if (!order) {
    await sendTelegramMessage(`❌ Order ${orderNumber} was not found.`);
    return;
  }
  const largest = message.photo[message.photo.length - 1];
  const receiptPath = path.join(UPLOAD_DIR, `receipt-${orderNumber}-${Date.now()}.jpg`);
  await downloadTelegramFile(largest.file_id, receiptPath);
  order.receiptUploaded = true;
  order.receiptUploadedTime = manilaDateTime(new Date());
  order.receiptTelegramFile = receiptPath;
  await writeOrders(orders);

  await sendTelegramPhoto(
    receiptPath,
    `MAIN-RECEIPT-${orderNumber}.jpg`,
    "image/jpeg",
    `🧾 MAIN RECEIPT — ${orderNumber}\nReceipt uploaded successfully.\nReview the receipt, then click ✅ COMPLETED only after the load/top-up is actually successful.`,
    completedKeyboard(orderNumber)
  );
}

async function handleTelegramCallback(callbackQuery) {
  const data = String(callbackQuery?.data || "");
  const callbackId = callbackQuery.id;
  try {
    if (data.startsWith("receipt_help:")) {
      const orderNumber = data.slice("receipt_help:".length);
      const form = new FormData();
      form.append("callback_query_id", callbackId);
      form.append("text", "Send the MAIN RECEIPT photo here with caption: RECEIPT " + orderNumber);
      form.append("show_alert", "true");
      await telegramRequest("answerCallbackQuery", form);
      return;
    }
    if (!data.startsWith("complete:")) return;
    const orderNumber = data.slice("complete:".length);
    const order = await markOrderCompleted(orderNumber);
    const answerForm = new FormData();
    answerForm.append("callback_query_id", callbackId);
    answerForm.append("text", "Order marked COMPLETED.");
    answerForm.append("show_alert", "false");
    await telegramRequest("answerCallbackQuery", answerForm);
    await sendTelegramMessage(completedMessage(order));
  } catch (err) {
    try {
      const errorForm = new FormData();
      errorForm.append("callback_query_id", callbackId);
      errorForm.append("text", err.message || "Failed.");
      errorForm.append("show_alert", "true");
      await telegramRequest("answerCallbackQuery", errorForm);
    } catch {}
    console.error("Telegram callback failed:", err);
  }
}

let telegramOffset = 0;
let telegramPollingStarted = false;
async function startTelegramPolling() {
  if (telegramPollingStarted) return;
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  telegramPollingStarted = true;
  console.log("Telegram receipt + completed polling enabled.");
  while (true) {
    try {
      const { token } = getTelegramConfig();
      const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${telegramOffset}`;
      const response = await fetch(url);
      const data = await response.json();
      if (!data.ok) throw new Error(JSON.stringify(data));
      for (const update of data.result || []) {
        telegramOffset = update.update_id + 1;
        if (update.callback_query) await handleTelegramCallback(update.callback_query);
        if (update.message?.photo) await handleTelegramReceipt(update.message);
      }
    } catch (err) {
      console.error("Telegram polling error:", err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ===============================
// ORDER API
// ===============================

app.post(
  "/api/orders",

  upload.single(
    "Payment Screenshot"
  ),

  async (req, res) => {

    try {

      const message =
        makeMessage(req.body);

      // Send order details and payment screenshot together
      if (req.file) {
        await sendTelegramPhoto(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          message,
          receiptUploadKeyboard(clean(req.body["Order Number"]))
        );
      } else {
        await sendTelegramMessage(message, receiptUploadKeyboard(clean(req.body["Order Number"])));
      }
      // Save order + customer-facing status
      const orderNumber = clean(req.body["Order Number"]);
      const orders = await readOrders();
      const now = new Date();
      const record = {
        orderNumber,
        orderTime: manilaDateTime(now),
        status: "PROCESSING",
        successfulTime: null,
        fields: req.body,
        telegramNotification: true,
        telegramScreenshot: !!req.file,
        receiptUploaded: false,
        receiptUploadedTime: null,
        receiptTelegramFile: null
      };
      orders[orderNumber] = record;
      await writeOrders(orders);

      fs.appendFileSync(
        path.join(
          __dirname,
          "orders.log"
        ),
        JSON.stringify(record) + "\n"
      );

      // Send successful response
      return res.status(200).json({
        ok: true,

        orderNumber,

        telegramNotification:
          true,

        telegramScreenshot:
          !!req.file
      });

    } catch (err) {

      console.error(
        "Order submission failed:",
        err
      );

      return res.status(500).json({
        error:
          err.message ||
          "Unable to submit the order."
      });
    }
  }
);

// ===============================
// WEB PUSH SUBSCRIPTIONS
// ===============================
app.get("/api/push/public-key", (req, res) => {
  if (!pool || !vapidPublicKey || !vapidPrivateKey) return res.status(503).json({ ok: false, error: "Push notifications are not configured yet." });
  res.json({ ok: true, publicKey: vapidPublicKey });
});
app.post("/api/push/subscribe", express.json({ limit: "100kb" }), async (req, res) => {
  try {
    if (!pool || !vapidPublicKey || !vapidPrivateKey) return res.status(503).json({ ok: false, error: "Push notifications are not configured yet." });
    const subscription = req.body?.subscription;
    const endpoint = String(subscription?.endpoint || "");
    if (!endpoint || !subscription?.keys) return res.status(400).json({ ok: false, error: "Invalid push subscription." });
    const orderNumber = clean(req.body?.orderNumber || "");
    await pool.query(`INSERT INTO eloading_push_subscriptions(endpoint, order_number, subscription) VALUES($1, $2, $3::jsonb) ON CONFLICT(endpoint) DO UPDATE SET order_number = CASE WHEN EXCLUDED.order_number <> '' THEN EXCLUDED.order_number ELSE eloading_push_subscriptions.order_number END, subscription = EXCLUDED.subscription`, [endpoint, orderNumber, JSON.stringify(subscription)]);
    res.json({ ok: true });
  } catch (e) { console.error("Push subscription failed:", e); res.status(500).json({ ok: false, error: "Unable to save notification settings." }); }
});
app.post("/api/push/associate", express.json({ limit: "20kb" }), async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false });
    const orderNumber = clean(req.body?.orderNumber || "");
    const endpoint = String(req.body?.endpoint || "");
    if (!orderNumber || !endpoint) return res.status(400).json({ ok: false });
    await pool.query("UPDATE eloading_push_subscriptions SET order_number = $1 WHERE endpoint = $2", [orderNumber, endpoint]);
    res.json({ ok: true });
  } catch (e) { console.error("Push association failed:", e); res.status(500).json({ ok: false }); }
});

// ===============================
// CUSTOMER ORDER STATUS
// ===============================

app.get("/api/orders/:orderNumber", async (req, res) => {
  const order = (await readOrders())[clean(req.params.orderNumber)];
  if (!order) return res.status(404).json({ ok: false, error: "Order not found." });
  const f = order.fields || {};
  res.json({
    ok: true,
    orderNumber: order.orderNumber,
    customer: clean(f["Customer Name"]),
    orderType: (String(f["Order Type"] || "").toLowerCase().includes("mlbb") || String(f["Network"] || "").toLowerCase() === "mlbb") ? "ML" : "Loading",
    network: clean(f["Network Selected"] || f["Network"]),
    mobile: clean(f["Mobile Number"]),
    userId: clean(f["MLBB User ID"]),
    zoneId: clean(f["MLBB Zone ID"]),
    promo: clean(f["Promo Selected"] || f["Promo"]),
    amount: clean(f["Amount"]),
    payment: clean(f["Payment Method"]),
    orderTime: order.orderTime,
    status: order.status,
    successfulTime: order.successfulTime
  });
});

// ===============================
// ADMIN: MARK ORDER COMPLETED
// ===============================

app.post("/api/admin/orders/:orderNumber/complete", express.json(), async (req, res) => {
  if (!adminAuthorized(req)) return res.status(401).json({ ok: false, error: "Unauthorized." });
  try {
    const order = await markOrderCompleted(req.params.orderNumber);
    res.json({ ok: true, order });
  } catch (e) {
    res.status(404).json({ ok: false, error: e.message });
  }
});

// ===============================
// SIMPLE ADMIN PAGE
// ===============================

app.get("/admin", async (req, res) => {
  if (!adminAuthorized(req)) return res.status(401).send("Unauthorized. Open /admin?key=YOUR_ADMIN_KEY");
  const orders = Object.values(await readOrders()).reverse();
  const rows = orders.map(o => `<tr><td>${escapeHtml(o.orderNumber)}</td><td>${escapeHtml(o.fields?.["Customer Name"] || "")}</td><td>${escapeHtml(o.status)}</td><td>${escapeHtml(o.orderTime)}</td><td>${escapeHtml(o.successfulTime || "—")}</td><td>${o.status === "COMPLETED" ? "✅ Completed" : `<button onclick="completeOrder('${encodeURIComponent(o.orderNumber)}')">✅ COMPLETED</button>`}</td></tr>`).join("");
  res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ronald Admin</title><style>body{font-family:Arial,sans-serif;padding:20px;background:#f5f7fb}table{width:100%;border-collapse:collapse;background:#fff}th,td{padding:10px;border:1px solid #ddd;text-align:left}button{padding:8px 12px;border:0;border-radius:8px;cursor:pointer}h1{font-size:22px}@media(max-width:700px){table{font-size:12px}th,td{padding:6px}}</style></head><body><h1>RONALD E-LOADING — ADMIN</h1><p>Click <b>COMPLETED</b> only after the load/top-up is actually successful.</p><table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Order Time</th><th>Successful Time</th><th>Action</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No orders yet.</td></tr>'}</tbody></table><script>const KEY=${JSON.stringify(String(req.query.key||""))};async function completeOrder(no){if(!confirm('Confirm this order is successfully loaded?'))return;const r=await fetch('/api/admin/orders/'+no+'/complete?key='+encodeURIComponent(KEY),{method:'POST',headers:{'Content-Type':'application/json'}});const d=await r.json();if(!r.ok)alert(d.error||'Failed');else location.reload();}</script></body></html>`);
});
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[c]));}

// ===============================
// HEALTH CHECK
// ===============================

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      ok: true,

      telegramConfigured:
        Boolean(
          process.env.TELEGRAM_BOT_TOKEN &&
          process.env.TELEGRAM_CHAT_ID
        )
    });

  }
);

// ===============================
// RETAILER PORTAL (wallet + top-ups)
// ===============================
const crypto = require('crypto');
const RETAILER_COOKIE = 'ronald_retailer_session';
const retailerUpload = upload;
let retailerDbReady = false;
async function initRetailerDb() {
  if (!pool) throw new Error('PostgreSQL DATABASE_URL is required for the retailer portal. Configure a persistent Render PostgreSQL database.');
  if (retailerDbReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS retailer_users (
    id BIGSERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL, wallet_cents BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), active BOOLEAN NOT NULL DEFAULT TRUE
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS retailer_sessions (
    token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES retailer_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS retailer_topups (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES retailer_users(id), amount_cents BIGINT NOT NULL,
    method TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', receipt_path TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), reviewed_at TIMESTAMPTZ, reviewed_by TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS retailer_orders (
    id BIGSERIAL PRIMARY KEY, order_number TEXT UNIQUE NOT NULL, user_id BIGINT NOT NULL REFERENCES retailer_users(id),
    customer_name TEXT NOT NULL, mobile TEXT NOT NULL, network TEXT NOT NULL, promo TEXT NOT NULL, amount_cents BIGINT NOT NULL,
    notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'PROCESSING', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ, debited_at TIMESTAMPTZ
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS retailer_wallet_ledger (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES retailer_users(id), kind TEXT NOT NULL,
    amount_cents BIGINT NOT NULL, reference TEXT NOT NULL UNIQUE, description TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`DELETE FROM retailer_sessions WHERE expires_at < NOW()`);
  retailerDbReady = true;
}
const hashText = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try { const [salt, expected] = String(stored).split(':'); const actual = crypto.scryptSync(String(password), salt, 64); const wanted = Buffer.from(expected, 'hex'); return wanted.length === actual.length && crypto.timingSafeEqual(actual, wanted); } catch { return false; }
}
function cookieToken(req) {
  const raw = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(RETAILER_COOKIE + '='));
  return raw ? decodeURIComponent(raw.slice(RETAILER_COOKIE.length + 1)) : '';
}
function setRetailerCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${RETAILER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
}
async function getRetailer(req) {
  await initRetailerDb();
  const token = cookieToken(req); if (!token) return null;
  const r = await pool.query(`SELECT u.id,u.username,u.display_name,u.wallet_cents,u.active FROM retailer_sessions s JOIN retailer_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()`, [hashText(token)]);
  return r.rows[0] || null;
}
async function requireRetailer(req,res,next) {
  try { const user = await getRetailer(req); if (!user || !user.active) return res.status(401).json({error:'Please log in again.'}); req.retailer=user; next(); }
  catch(e) { console.error('Retailer auth:',e.message); res.status(503).json({error:e.message}); }
}
const cents = v => Math.round(Number(v) * 100);
const peso = v => (Number(v || 0) / 100).toFixed(2);
const allowedPaymentMethods = ['GCash','Maya','GoTyme Bank','MariBank','CIMB Bank','Vybe by BPI','QR PH'];
app.get('/retailer', (req,res) => res.sendFile(path.join(__dirname,'retailer.html')));
app.post('/api/retailer/register', express.json({limit:'20kb'}), async (req,res) => {
  try {
    await initRetailerDb();
    const username=String(req.body?.username||'').trim().toLowerCase();
    const displayName=String(req.body?.displayName||'').trim().slice(0,80);
    const password=String(req.body?.password||'');
    if (!/^[a-z0-9_]{4,24}$/.test(username)) return res.status(400).json({error:'Username must be 4–24 characters (letters, numbers, underscore).'});
    if (displayName.length < 2) return res.status(400).json({error:'Enter your name or store name.'});
    if (password.length < 8) return res.status(400).json({error:'Password must be at least 8 characters.'});
    const result=await pool.query('INSERT INTO retailer_users(username,display_name,password_hash) VALUES($1,$2,$3) RETURNING id,username,display_name,wallet_cents,active',[username,displayName,passwordHash(password)]);
    const token=crypto.randomBytes(32).toString('hex');
    await pool.query(`INSERT INTO retailer_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')`,[hashText(token),result.rows[0].id]);
    setRetailerCookie(res,token); res.status(201).json({ok:true,user:result.rows[0]});
  } catch(e) { if(e.code==='23505') return res.status(409).json({error:'Username already exists. Please choose another.'}); console.error(e); res.status(503).json({error:e.message||'Registration failed.'}); }
});
app.post('/api/retailer/login', express.json({limit:'20kb'}), async (req,res) => {
  try {
    await initRetailerDb(); const username=String(req.body?.username||'').trim().toLowerCase(); const password=String(req.body?.password||'');
    const r=await pool.query('SELECT * FROM retailer_users WHERE username=$1',[username]); const user=r.rows[0];
    if(!user || !user.active || !verifyPassword(password,user.password_hash)) return res.status(401).json({error:'Incorrect username or password.'});
    const token=crypto.randomBytes(32).toString('hex'); await pool.query(`INSERT INTO retailer_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')`,[hashText(token),user.id]);
    setRetailerCookie(res,token); res.json({ok:true,user:{id:user.id,username:user.username,display_name:user.display_name,wallet_cents:user.wallet_cents}});
  } catch(e) { console.error(e); res.status(503).json({error:e.message||'Login failed.'}); }
});
app.post('/api/retailer/logout', async (req,res) => { try { const token=cookieToken(req); if(pool&&token) await pool.query('DELETE FROM retailer_sessions WHERE token_hash=$1',[hashText(token)]); res.setHeader('Set-Cookie',`${RETAILER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`); res.json({ok:true}); } catch(e){res.status(500).json({error:'Could not log out.'});} });
app.get('/api/retailer/me', requireRetailer, async (req,res) => {
  const [orders,topups,ledger]=await Promise.all([
    pool.query('SELECT order_number,customer_name,mobile,network,promo,amount_cents,status,created_at,completed_at FROM retailer_orders WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[req.retailer.id]),
    pool.query('SELECT id,amount_cents,method,reference,status,created_at,reviewed_at FROM retailer_topups WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[req.retailer.id]),
    pool.query('SELECT kind,amount_cents,reference,description,created_at FROM retailer_wallet_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 100',[req.retailer.id])
  ]);
  res.json({user:req.retailer,orders:orders.rows,topups:topups.rows,ledger:ledger.rows});
});
app.post('/api/retailer/topups', requireRetailer, retailerUpload.single('receipt'), async (req,res) => {
  try {
    const amount=Number(req.body.amount); const method=String(req.body.method||''); const reference=String(req.body.reference||'').trim().slice(0,120);
    if(!Number.isFinite(amount)||amount<50||amount>50000) return res.status(400).json({error:'Top-up amount must be between ₱50 and ₱50,000.'});
    if(!allowedPaymentMethods.includes(method)) return res.status(400).json({error:'Choose a valid payment method.'});
    if(!req.file) return res.status(400).json({error:'Please attach your payment receipt (JPG or PNG).'});
    const r=await pool.query(`INSERT INTO retailer_topups(user_id,amount_cents,method,reference,receipt_path) VALUES($1,$2,$3,$4,$5) RETURNING id,amount_cents,method,reference,status,created_at`,[req.retailer.id,cents(amount),method,reference,req.file.path]);
    const t=r.rows[0];
    const note=`💳 RETAILER WALLET TOP-UP REQUEST\nRequest #${t.id}\nRetailer: ${req.retailer.display_name} (@${req.retailer.username})\nAmount: ₱${peso(t.amount_cents)}\nMethod: ${method}\nReference: ${reference||'Not provided'}\nReview in the retailer admin panel before approving.`;
    try { await sendTelegramPhoto(req.file.path,req.file.originalname,req.file.mimetype,note); } catch(e) { console.error('Top-up Telegram alert failed:',e.message); try { await sendTelegramMessage(note); } catch(_) {} }
    res.status(201).json({ok:true,topup:t,message:'Top-up request submitted. Your wallet will increase only after admin approval.'});
  } catch(e){console.error(e);res.status(500).json({error:'Could not submit top-up request.'});}
});
app.post('/api/retailer/orders', requireRetailer, express.json({limit:'20kb'}), async (req,res) => {
  try {
    const b=req.body||{}; const customer=String(b.customerName||'').trim().slice(0,80); const mobile=String(b.mobile||'').trim().slice(0,30); const network=String(b.network||'').trim().slice(0,40); const promo=String(b.promo||'').trim().slice(0,120); const amount=Number(b.amount); const notes=String(b.notes||'').trim().slice(0,300);
    if(!customer||!mobile||!network||!promo||!Number.isFinite(amount)||amount<=0||amount>50000) return res.status(400).json({error:'Complete all order fields and enter a valid amount.'});
    // Pending orders do not debit the wallet, but their value is reserved when checking
    // new orders so multiple pending orders cannot knowingly exceed available funds.
    const bal=await pool.query(`SELECT u.wallet_cents, COALESCE(SUM(o.amount_cents),0) AS pending_cents FROM retailer_users u LEFT JOIN retailer_orders o ON o.user_id=u.id AND o.status='PROCESSING' AND o.debited_at IS NULL WHERE u.id=$1 GROUP BY u.id`,[req.retailer.id]);
    const available=Number(bal.rows[0]?.wallet_cents||0)-Number(bal.rows[0]?.pending_cents||0);
    if(available<cents(amount)) return res.status(400).json({error:`Insufficient available balance. Available after pending orders: ₱${peso(available)}. Please top up first.`});
    const orderNo='R-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase();
    const r=await pool.query(`INSERT INTO retailer_orders(order_number,user_id,customer_name,mobile,network,promo,amount_cents,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[orderNo,req.retailer.id,customer,mobile,network,promo,cents(amount),notes]);
    const o=r.rows[0];
    try { await sendTelegramMessage(`🛒 RETAILER ORDER\nOrder: ${orderNo}\nRetailer: ${req.retailer.display_name} (@${req.retailer.username})\nCustomer: ${customer}\nMobile: ${mobile}\nNetwork: ${network}\nPromo: ${promo}\nAmount: ₱${peso(o.amount_cents)}\nStatus: PROCESSING\nNo wallet deduction until you mark this order COMPLETED after a successful load.`); } catch(e){console.error('Telegram order alert failed:',e.message);}
    res.status(201).json({ok:true,order:o,message:'Order submitted. No wallet deduction has been made yet.'});
  } catch(e){console.error(e);res.status(500).json({error:'Could not submit order.'});}
});
// Admin endpoints use the private ADMIN_KEY header. Never expose this key in frontend code.
app.get('/api/retailer/admin/overview', async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  try { await initRetailerDb(); const [users,topups,orders]=await Promise.all([
    pool.query('SELECT id,username,display_name,wallet_cents,active,created_at FROM retailer_users ORDER BY id DESC'),
    pool.query(`SELECT t.*,u.username,u.display_name FROM retailer_topups t JOIN retailer_users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 300`),
    pool.query(`SELECT o.*,u.username,u.display_name FROM retailer_orders o JOIN retailer_users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 500`)
  ]); res.json({users:users.rows,topups:topups.rows,orders:orders.rows}); }
  catch(e){res.status(503).json({error:e.message||'Database unavailable.'});}
});
app.post('/api/retailer/admin/topups/:id/approve', express.json({limit:'10kb'}), async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  const client=await pool.connect(); try { await client.query('BEGIN'); const q=await client.query(`SELECT * FROM retailer_topups WHERE id=$1 FOR UPDATE`,[req.params.id]); const t=q.rows[0]; if(!t) throw new Error('Top-up request not found.'); if(t.status!=='PENDING') throw new Error('This request has already been reviewed.');
    await client.query(`UPDATE retailer_topups SET status='APPROVED',reviewed_at=NOW(),reviewed_by='admin' WHERE id=$1`,[t.id]);
    await client.query('UPDATE retailer_users SET wallet_cents=wallet_cents+$1 WHERE id=$2',[t.amount_cents,t.user_id]);
    await client.query(`INSERT INTO retailer_wallet_ledger(user_id,kind,amount_cents,reference,description) VALUES($1,'TOPUP',$2,$3,$4)`,[t.user_id,t.amount_cents,`TOPUP-${t.id}`,`Approved ${t.method} top-up`]); await client.query('COMMIT'); res.json({ok:true});
  } catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});} finally{client.release();}
});
app.post('/api/retailer/admin/topups/:id/reject', express.json({limit:'10kb'}), async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  try { const r=await pool.query(`UPDATE retailer_topups SET status='REJECTED',reviewed_at=NOW(),reviewed_by='admin' WHERE id=$1 AND status='PENDING' RETURNING id`,[req.params.id]); if(!r.rowCount)return res.status(400).json({error:'Request not found or already reviewed.'}); res.json({ok:true}); } catch(e){res.status(500).json({error:'Could not reject request.'});}
});
app.post('/api/retailer/admin/orders/:id/complete', express.json({limit:'10kb'}), async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  const client=await pool.connect(); try { await client.query('BEGIN'); const q=await client.query('SELECT * FROM retailer_orders WHERE id=$1 FOR UPDATE',[req.params.id]); const o=q.rows[0]; if(!o) throw new Error('Order not found.'); if(o.status==='COMPLETED' || o.debited_at) throw new Error('This order has already been completed and charged.'); if(o.status!=='PROCESSING') throw new Error('Only processing orders can be completed.');
    const u=await client.query('SELECT wallet_cents FROM retailer_users WHERE id=$1 FOR UPDATE',[o.user_id]); if(Number(u.rows[0].wallet_cents)<Number(o.amount_cents)) throw new Error('Retailer wallet has insufficient funds. The order cannot be completed or charged.');
    await client.query('UPDATE retailer_users SET wallet_cents=wallet_cents-$1 WHERE id=$2',[o.amount_cents,o.user_id]); await client.query(`UPDATE retailer_orders SET status='COMPLETED',completed_at=NOW(),debited_at=NOW() WHERE id=$1`,[o.id]);
    await client.query(`INSERT INTO retailer_wallet_ledger(user_id,kind,amount_cents,reference,description) VALUES($1,'ORDER_DEBIT',$2,$3,$4)`,[o.user_id,-Number(o.amount_cents),`ORDER-${o.order_number}`,`Completed loading order ${o.order_number}`]); await client.query('COMMIT');
    try { await sendTelegramMessage(`✅ RETAILER ORDER COMPLETED\n${o.order_number}\nAmount ₱${peso(o.amount_cents)} deducted from retailer @${o.user_id} only after completion.`); } catch(_) {} res.json({ok:true});
  } catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});} finally{client.release();}
});
app.post('/api/retailer/admin/orders/:id/reject', express.json({limit:'10kb'}), async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  try { const r=await pool.query(`UPDATE retailer_orders SET status='REJECTED' WHERE id=$1 AND status='PROCESSING' AND debited_at IS NULL RETURNING id`,[req.params.id]); if(!r.rowCount)return res.status(400).json({error:'Order not found or already reviewed.'}); res.json({ok:true}); } catch(e){res.status(500).json({error:'Could not reject order.'});}
});
app.post('/api/retailer/admin/wallet-adjust', express.json({limit:'10kb'}), async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  const userId=Number(req.body?.userId), amount=Number(req.body?.amount), reason=String(req.body?.reason||'Manual admin adjustment').trim().slice(0,200);
  if(!Number.isInteger(userId)||!Number.isFinite(amount)||amount===0||Math.abs(amount)>50000)return res.status(400).json({error:'Enter a valid user ID and non-zero adjustment amount.'});
  const client=await pool.connect();try{await client.query('BEGIN');const u=await client.query('SELECT wallet_cents FROM retailer_users WHERE id=$1 FOR UPDATE',[userId]);if(!u.rowCount)throw new Error('Retailer not found.');const adj=cents(amount);if(Number(u.rows[0].wallet_cents)+adj<0)throw new Error('Adjustment would make the wallet negative.');await client.query('UPDATE retailer_users SET wallet_cents=wallet_cents+$1 WHERE id=$2',[adj,userId]);const ref=`ADJ-${userId}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;await client.query(`INSERT INTO retailer_wallet_ledger(user_id,kind,amount_cents,reference,description) VALUES($1,'ADMIN_ADJUSTMENT',$2,$3,$4)`,[userId,adj,ref,reason]);await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});}finally{client.release();}
});

// ===============================
// START SERVER
// ===============================

(async () => {
  try {
    if (pool) await initDatabase();
    app.listen(PORT, () => {
      console.log(`Ronald E-Loading server running on port ${PORT}`);
      if (!pool) console.warn("WARNING: DATABASE_URL is missing. Orders are using local JSON storage, which may not survive Render restarts/redeploys.");
      startTelegramPolling();
    });
  } catch (e) {
    console.error("Database initialization failed:", e);
    process.exit(1);
  }
})();




