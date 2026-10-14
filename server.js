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
app.use(cors({ origin: true, credentials: true }));

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
  await pool.query(`CREATE TABLE IF NOT EXISTS eloading_push_subscriptions (endpoint TEXT PRIMARY KEY, order_number TEXT NOT NULL DEFAULT '', subscription JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), retailer_user_id BIGINT)`);
  await pool.query(`ALTER TABLE eloading_push_subscriptions ADD COLUMN IF NOT EXISTS retailer_user_id BIGINT`);
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
// Retailer browser push notifications (no Firebase). Delivery requires VAPID keys and permission.
async function sendRetailerPush(userId, title, body, tag = "retailer-status") {
  if (!pool || !vapidPublicKey || !vapidPrivateKey || !userId) return;
  try {
    const result = await pool.query("SELECT endpoint, subscription FROM eloading_push_subscriptions WHERE retailer_user_id = $1", [userId]);
    const payload = JSON.stringify({ title, body, url: "/retailer?mode=login", tag });
    for (const row of result.rows) {
      try { await webpush.sendNotification(row.subscription, payload); }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await pool.query("DELETE FROM eloading_push_subscriptions WHERE endpoint = $1", [row.endpoint]);
        else console.error("Retailer push failed:", e.message);
      }
    }
  } catch (e) { console.error("Retailer push query failed:", e.message); }
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
  formData,
  tokenOverride = null
) {
  const token = tokenOverride || getTelegramConfig().token;

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

// Transaction records are sent only to the notification bot/chat; controls stay in the admin bot.
async function sendTransactionRecord(text) {
  try { await sendTelegramMessage(`📒 TRANSACTION RECORD\n${text}`); }
  catch (error) { console.error('Telegram transaction record notification failed:', error.message); }
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

async function downloadTelegramFile(fileId, destination, tokenOverride = null) {
  const token = tokenOverride || getTelegramConfig().token;
  const fileForm = new FormData();
  fileForm.append("file_id", fileId);
  const result = await telegramRequest("getFile", fileForm, token);
  const filePath = result.result.file_path;
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!response.ok) throw new Error("Unable to download Telegram receipt.");
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destination, buffer);
  return filePath;
}

function adminPanelUrl() {
  const base = String(process.env.ADMIN_PANEL_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://ronald-e-loading-retailer-business.onrender.com").replace(/\/$/, "");
  return base + "/admin";
}
async function handleRetailerTelegramAction(data, sendReply = sendTelegramMessage) {
  const [action, rawId] = data.split(":"); const id=Number(rawId);
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid record ID.");
  if (action === "retailer_complete") {
    const client=await pool.connect(); let order;
    try { await client.query("BEGIN"); const q=await client.query("SELECT * FROM retailer_orders WHERE id=$1 FOR UPDATE",[id]); order=q.rows[0]; if(!order) throw new Error("Order not found."); if(order.status!=="PROCESSING"||order.debited_at) throw new Error("Order is already reviewed."); const u=await client.query("SELECT wallet_cents,username,display_name FROM retailer_users WHERE id=$1 FOR UPDATE",[order.user_id]); if(!u.rowCount) throw new Error("Retailer not found."); if(Number(u.rows[0].wallet_cents)<Number(order.amount_cents)) throw new Error("Retailer wallet has insufficient funds; cannot complete or deduct.");
      await client.query("UPDATE retailer_users SET wallet_cents=wallet_cents-$1 WHERE id=$2",[order.amount_cents,order.user_id]); await client.query("UPDATE retailer_orders SET status='COMPLETED',completed_at=NOW(),debited_at=NOW() WHERE id=$1",[id]); await client.query("INSERT INTO retailer_wallet_ledger(user_id,kind,amount_cents,reference,description) VALUES($1,'ORDER_DEBIT',$2,$3,$4)",[order.user_id,-Number(order.amount_cents),`ORDER-${order.order_number}`,`Completed loading order ${order.order_number}`]); await client.query("COMMIT"); order.retailer_username=u.rows[0].username; order.retailer_name=u.rows[0].display_name;
      try { await sendRetailerPush(order.user_id, 'LOAD SUCCESSFUL', `Your load order ${order.order_number} was completed successfully.`, `load-${order.id}-successful`); } catch(e) { console.error('Retailer load success push failed:', e.message); }
    } catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    const record = `✅ RETAILER ORDER COMPLETED
Order: ${order.order_number}
Retailer ID: RET-${order.user_id} @${order.retailer_username}
Amount deducted: ₱${peso(order.amount_cents)}
Customer: ${order.customer_name}
${manilaDateTime(new Date())}`;
    await sendReply(record); await sendTransactionRecord(record); return "Order completed and wallet deduction recorded.";
  }
  if (action === "retailer_reject") {
    const r=await pool.query("UPDATE retailer_orders SET status='REJECTED' WHERE id=$1 AND status='PROCESSING' AND debited_at IS NULL RETURNING order_number,user_id",[id]); if(!r.rowCount) throw new Error("Order not found or already reviewed."); const record=`❌ RETAILER ORDER REJECTED
Order: ${r.rows[0].order_number}
Retailer ID: RET-${r.rows[0].user_id}
No wallet deduction was made.`; await sendReply(record); await sendTransactionRecord(record); return "Order rejected; wallet was not deducted.";
  }
  if (action === "retailer_topup_approve") {
    const client=await pool.connect(); let t;
    try { await client.query("BEGIN"); const q=await client.query("SELECT * FROM retailer_topups WHERE id=$1 FOR UPDATE",[id]); t=q.rows[0]; if(!t) throw new Error("Top-up request not found."); if(t.status!=="PENDING") throw new Error("Top-up was already reviewed."); await client.query("UPDATE retailer_topups SET status='APPROVED',reviewed_at=NOW(),reviewed_by='telegram-admin' WHERE id=$1",[id]); await client.query("UPDATE retailer_users SET wallet_cents=wallet_cents+$1 WHERE id=$2",[t.amount_cents,t.user_id]); await client.query("INSERT INTO retailer_wallet_ledger(user_id,kind,amount_cents,reference,description) VALUES($1,'TOPUP',$2,$3,$4)",[t.user_id,t.amount_cents,`TOPUP-${id}`,`Approved ${t.method} top-up`]); await client.query("COMMIT"); } catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
     try { await sendRetailerPush(t.user_id, 'TOP-UP SUCCESSFUL', `₱${peso(t.amount_cents)} has been added to your wallet.`, `topup-${id}-successful`); } catch(e) { console.error('Retailer top-up success push failed:', e.message); }
    const record=`✅ TOP-UP APPROVED
Request: #${id}
Retailer ID: RET-${t.user_id}
Amount added: ₱${peso(t.amount_cents)}
Method: ${t.method}`; await sendReply(record); await sendTransactionRecord(record); return "Top-up approved and wallet balance added.";
  }
  if (action === "retailer_topup_reject") {
    const r=await pool.query("UPDATE retailer_topups SET status='REJECTED',reviewed_at=NOW(),reviewed_by='telegram-admin' WHERE id=$1 AND status='PENDING' RETURNING user_id,amount_cents,method",[id]); if(!r.rowCount) throw new Error("Top-up not found or already reviewed."); const record=`❌ TOP-UP REJECTED
Request: #${id}
Retailer ID: RET-${r.rows[0].user_id}
No wallet balance was added.`; await sendReply(record); await sendTransactionRecord(record); return "Top-up rejected; no balance was added.";
  }
  throw new Error("Unknown retailer action.");
}
// ===============================
// SEPARATE TELEGRAM ADMIN BOT
// ===============================
// TELEGRAM_BOT_TOKEN is notification-only; it never polls for commands or callbacks.
// TELEGRAM_ADMIN_BOT_TOKEN handles private admin commands, callbacks, receipt uploads, and order management.
function adminBotAllowedUserId() {
  // Keep the existing five-variable Render setup: use TELEGRAM_ADMIN_USER_ID if
  // configured, otherwise fall back to TELEGRAM_CHAT_ID. The fallback works only
  // when TELEGRAM_CHAT_ID is the administrator's private Telegram chat/user ID.
  return String(process.env.TELEGRAM_ADMIN_USER_ID || process.env.TELEGRAM_CHAT_ID || '').trim();
}
function adminBotAuthorized(update) {
  const allowedId = adminBotAllowedUserId();
  const message = update?.message || update?.callback_query?.message;
  const fromId = String(update?.from?.id || update?.callback_query?.from?.id || '');
  const chat = message?.chat;
  return Boolean(allowedId && fromId === allowedId && chat?.type === 'private' && String(chat.id) === allowedId);
}
async function adminBotRequest(method, formData) {
  const token = String(process.env.TELEGRAM_ADMIN_BOT_TOKEN || '').trim();
  if (!token) throw new Error('TELEGRAM_ADMIN_BOT_TOKEN is not configured.');
  return telegramRequest(method, formData, token);
}
async function sendAdminBotMessage(text, replyMarkup = null) {
  const chatId = adminBotAllowedUserId();
  if (!chatId) throw new Error('Set TELEGRAM_CHAT_ID to the admin private chat ID, or configure TELEGRAM_ADMIN_USER_ID.');
  const form = new FormData(); form.append('chat_id', chatId); form.append('text', String(text));
  form.append('disable_web_page_preview', 'true');
  if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
  return adminBotRequest('sendMessage', form);
}
async function sendAdminBotPhoto(filePath, originalName, mimeType, caption, replyMarkup = null) {
  const chatId = adminBotAllowedUserId();
  if (!chatId) throw new Error('Set TELEGRAM_CHAT_ID to the admin private chat ID, or configure TELEGRAM_ADMIN_USER_ID.');
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('photo', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), originalName || 'receipt.jpg');
  form.append('caption', String(caption).slice(0, 1024));
  if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
  return adminBotRequest('sendPhoto', form);
}
async function answerAdminBotCallback(callbackId, text, showAlert = false) {
  const form = new FormData(); form.append('callback_query_id', callbackId);
  form.append('text', String(text).slice(0,190)); form.append('show_alert', showAlert ? 'true' : 'false');
  return adminBotRequest('answerCallbackQuery', form);
}
function adminBotMainOrderKeyboard(orderNumber, receiptUploaded = false) {
  const rows = [[{text:'📎 RECEIPT INSTRUCTIONS', callback_data:`ab:main-receipt-help:${orderNumber}`}]];
  if (receiptUploaded) rows.push([{text:'✅ COMPLETED', callback_data:`ab:main-complete:${orderNumber}`}]);
  rows.push([{text:'⬅️ ADMIN MENU', callback_data:'ab:menu'}]);
  return { inline_keyboard: rows };
}
async function handleAdminBotReceipt(message) {
  if (!adminBotAuthorized({from:message?.from,message})) return;
  if (!message?.photo?.length) return;
  const orderNumber = extractOrderNumberFromCaption(message.caption);
  if (!orderNumber) {
    await sendAdminBotMessage('📎 Hindi makita ang Order Number. I-send muli ang receipt photo na may caption na: RECEIPT REL-YYYYMMDD-XXXX', adminBotMenuKeyboard());
    return;
  }
  const orders = await readOrders();
  const order = orders[orderNumber];
  if (!order) {
    await sendAdminBotMessage(`❌ Hindi nahanap ang order ${orderNumber}.`, adminBotMenuKeyboard());
    return;
  }
  if (order.status === 'COMPLETED') {
    await sendAdminBotMessage(`ℹ️ Order ${orderNumber} is already completed.`, adminBotMenuKeyboard());
    return;
  }
  const largest = message.photo[message.photo.length - 1];
  const receiptPath = path.join(UPLOAD_DIR, `receipt-${orderNumber}-${Date.now()}.jpg`);
  const token = String(process.env.TELEGRAM_ADMIN_BOT_TOKEN || '').trim();
  await downloadTelegramFile(largest.file_id, receiptPath, token);
  order.receiptUploaded = true;
  order.receiptUploadedTime = manilaDateTime(new Date());
  order.receiptTelegramFile = receiptPath;
  await writeOrders(orders);
  await sendAdminBotPhoto(receiptPath, `MAIN-RECEIPT-${orderNumber}.jpg`, 'image/jpeg',
    `🧾 MAIN RECEIPT — ${orderNumber}
Receipt uploaded successfully. Mark COMPLETED only after the load/top-up is actually successful.`,
    {inline_keyboard:[[{text:'✅ COMPLETED',callback_data:`ab:main-complete:${orderNumber}`}],[{text:'⬅️ ADMIN MENU',callback_data:'ab:menu'}]]});
}
function adminBotMenuKeyboard() {
  return { inline_keyboard: [
    [{text:'💳 PENDING TOP-UPS',callback_data:'ab:topups'}],
    [{text:'🛒 RETAILER LOAD ORDERS',callback_data:'ab:orders'}],
    [{text:'🧾 WEBSITE ORDERS',callback_data:'ab:main-orders'}],
    [{text:'👥 RETAILERS / BALANCES',callback_data:'ab:retailers'}],
    [{text:'🌐 OPEN WEBSITE ADMIN PANEL',url:adminPanelUrl()}]
  ]};
}
function adminBotAlertKeyboard() { return adminBotMenuKeyboard(); }
async function configureAdminBotMenu() {
  try {
    const commands = new FormData();
    commands.append('commands', JSON.stringify([
      {command:'start',description:'Open Admin Panel'},
      {command:'panel',description:'Show Admin Panel'},
      {command:'retailers',description:'View retailers and balances'},
      {command:'wallet',description:'Add or deduct wallet balance'}
    ]));
    await adminBotRequest('setMyCommands', commands);
    const chatId = adminBotAllowedUserId();
    if (chatId) {
      const menu = new FormData(); menu.append('chat_id', chatId);
      menu.append('menu_button', JSON.stringify({type:'commands'}));
      await adminBotRequest('setChatMenuButton', menu);
    }
  } catch (e) { console.error('Admin bot menu setup failed:', e.message); }
}
function adminBotTopupKeyboard(id) { return {inline_keyboard:[[{text:'✅ APPROVE TOP-UP',callback_data:`ab:topup-approve:${id}`},{text:'❌ REJECT',callback_data:`ab:topup-reject:${id}`}],[{text:'⬅️ ADMIN MENU',callback_data:'ab:menu'}]]}; }
function adminBotOrderKeyboard(id) { return {inline_keyboard:[[{text:'✅ COMPLETED + DEDUCT',callback_data:`ab:order-complete:${id}`},{text:'❌ REJECT',callback_data:`ab:order-reject:${id}`}],[{text:'⬅️ ADMIN MENU',callback_data:'ab:menu'}]]}; }
async function handleAdminBotCommand(message) {
  if (!adminBotAuthorized({from:message?.from,message})) return;
  const text = String(message?.text || '').trim();
  if (/^\/(start|help|panel)(?:@\w+)?$/i.test(text)) {
    await sendAdminBotMessage('🔐 RONALD E-LOADING ADMIN PANEL\n\nNarito na ang admin menu. Gamitin ang buttons sa ibaba para sa top-ups, load orders, retailers/balances, at website admin panel. Kapag may bagong order o top-up, automatic ding may alert at panel buttons.\n\nCommands:\n/panel — admin menu\n/retailers — retailer balances\n/wallet RET-12 +500 verified payment\n/wallet RET-12 -50 correction', adminBotMenuKeyboard()); return;
  }
  if (/^\/retailers(?:@\w+)?$/i.test(text)) {
    const r = await pool.query('SELECT id,username,display_name,wallet_cents,active FROM retailer_users ORDER BY id DESC LIMIT 50');
    await sendAdminBotMessage(r.rows.length ? '👥 RETAILERS / WALLET BALANCES\n' + r.rows.map(u=>`RET-${u.id} | ${u.display_name} (@${u.username}) | ₱${peso(u.wallet_cents)} | ${u.active?'ACTIVE':'DISABLED'}`).join('\n') : 'Wala pang retailer accounts.', adminBotMenuKeyboard()); return;
  }
  const m = text.match(/^\/wallet(?:@\w+)?\s+(?:RET-)?(\d+)\s+([+-]?\d+(?:\.\d{1,2})?)\s+(.+)$/i);
  if (m) {
    const id=Number(m[1]), amount=Number(m[2]), reason=m[3].trim().slice(0,180);
    if (!Number.isFinite(amount) || amount===0 || Math.abs(amount)>50000) { await sendAdminBotMessage('Amount must be non-zero and no more than ₱50,000 in either direction.', adminBotMenuKeyboard()); return; }
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const q=await client.query('SELECT wallet_cents,username,display_name FROM retailer_users WHERE id=$1 FOR UPDATE',[id]);
      if(!q.rowCount) throw new Error('Retailer ID not found.');
      const adj=cents(amount), newBalance=Number(q.rows[0].wallet_cents)+adj;
      if(newBalance<0) throw new Error('This adjustment would make the wallet negative.');
      await client.query('UPDATE retailer_users SET wallet_cents=wallet_cents+$1 WHERE id=$2',[adj,id]);
      const ref=`TG-ADMIN-ADJ-${id}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      await client.query("INSERT INTO retailer_wallet_ledger(user_id,kind,amount_cents,reference,description) VALUES($1,'ADMIN_ADJUSTMENT',$2,$3,$4)",[id,adj,ref,reason]);
      await client.query('COMMIT');
      const record=`💰 WALLET UPDATED
Retailer ID: RET-${id}
Store: ${q.rows[0].display_name} (@${q.rows[0].username})
Adjustment: ${amount>0?'+':''}₱${peso(Math.abs(adj))}
New balance: ₱${peso(newBalance)}
Reason: ${reason}
Ref: ${ref}`;
      await sendAdminBotMessage(record, adminBotMenuKeyboard()); await sendTransactionRecord(record);
    } catch(e) { await client.query('ROLLBACK'); await sendAdminBotMessage(`❌ Wallet adjustment failed: ${e.message}`, adminBotMenuKeyboard()); }
    finally { client.release(); }
    return;
  }
  if (/^\/wallet(?:@\w+)?$/i.test(text)) { await sendAdminBotMessage('Usage:\n/wallet RET-12 +500 verified payment\n/wallet RET-12 -50 correction', adminBotMenuKeyboard()); return; }
  await sendAdminBotMessage('Unknown command. Send /panel to open the admin menu.', adminBotMenuKeyboard());
}
async function handleAdminBotCallback(callbackQuery) {
  const id = callbackQuery?.id, data=String(callbackQuery?.data||'');
  if (!adminBotAuthorized({from:callbackQuery?.from,callback_query:callbackQuery})) {
    try { await answerAdminBotCallback(id,'Not authorized. Only the configured admin account can use this bot.',true); } catch (e) { console.error('Admin callback acknowledgement failed:', e.message); }
    return;
  }
  // Acknowledge the click before database queries or other slow work. Telegram callback
  // queries expire quickly; do not wait for the action to finish before answering.
  try { await answerAdminBotCallback(id, 'Processing request…', false); }
  catch (e) { console.error('Admin callback acknowledgement failed:', e.message); }
  try {
    if (data==='ab:menu') { await sendAdminBotMessage('🛠 RONALD E-LOADING ADMIN MENU',adminBotMenuKeyboard()); return; }
    if (data==='ab:topups') {
      const r=await pool.query("SELECT t.id,t.user_id,t.amount_cents,t.method,t.reference,t.receipt_path,u.username,u.display_name FROM retailer_topups t JOIN retailer_users u ON u.id=t.user_id WHERE t.status='PENDING' ORDER BY t.id ASC LIMIT 20");
      if(!r.rows.length) { await sendAdminBotMessage('💳 Walang pending top-up requests.',adminBotMenuKeyboard()); return; }
      for (const t of r.rows) {
        const caption = `💳 PENDING TOP-UP #${t.id}
Retailer: ${t.display_name} (@${t.username})
Retailer ID: RET-${t.user_id}
Amount: ₱${peso(t.amount_cents)}
Method: ${t.method}
Reference: ${t.reference||'Not provided'}

I-approve lang kapag verified ang payment.`;
        if (t.receipt_path && fs.existsSync(t.receipt_path)) await sendAdminBotPhoto(t.receipt_path, path.basename(t.receipt_path), 'image/jpeg', caption, adminBotTopupKeyboard(t.id));
        else await sendAdminBotMessage(caption, adminBotTopupKeyboard(t.id));
      }
      return;
    }
    if (data==='ab:orders') {
      const r=await pool.query("SELECT o.id,o.order_number,o.user_id,o.amount_cents,o.customer_name,o.status,u.username,u.display_name FROM retailer_orders o JOIN retailer_users u ON u.id=o.user_id WHERE o.status='PROCESSING' AND o.debited_at IS NULL ORDER BY o.id ASC LIMIT 20");
      if(!r.rows.length) { await sendAdminBotMessage('🛒 Walang pending retailer orders.',adminBotMenuKeyboard()); return; }
      for(const o of r.rows) await sendAdminBotMessage(`🛒 PENDING ORDER\nOrder: ${o.order_number}\nRetailer: ${o.display_name} (@${o.username})\nRetailer ID: RET-${o.user_id}\nAmount: ₱${peso(o.amount_cents)}\nCustomer: ${o.customer_name}\nStatus: PROCESSING\n\nPindutin ang COMPLETED + DEDUCT kapag successful na ang load.`,adminBotOrderKeyboard(o.id)); return;
    }
    if (data==='ab:retailers') {
      const r=await pool.query('SELECT id,username,display_name,wallet_cents,active FROM retailer_users ORDER BY id DESC LIMIT 50');
      await sendAdminBotMessage(r.rows.length?'👥 RETAILERS / WALLET BALANCES\n'+r.rows.map(u=>`RET-${u.id} | ${u.display_name} (@${u.username}) | ₱${peso(u.wallet_cents)} | ${u.active?'ACTIVE':'DISABLED'}`).join('\n'):'Wala pang retailer accounts.',adminBotMenuKeyboard()); return;
    }
    if (data==='ab:main-orders') {
      const orders = await readOrders();
      const pending = Object.values(orders).filter(o => o && o.status !== 'COMPLETED').sort((a,b) => String(a.orderTime||'').localeCompare(String(b.orderTime||''))).slice(0,20);
      if (!pending.length) { await sendAdminBotMessage('🧾 Walang pending website orders.',adminBotMenuKeyboard()); return; }
      for (const o of pending) {
        const f=o.fields||{};
        await sendAdminBotMessage(`🧾 PENDING WEBSITE ORDER\nOrder: ${o.orderNumber}\nCustomer: ${clean(f['Customer Name'])}\nType: ${clean(f['Order Type']||'Loading')}\nNetwork: ${clean(f['Network Selected']||f['Network'])}\nPromo: ${clean(f['Promo Selected']||f['Promo'])}\nAmount: ${clean(f['Amount'])}\nStatus: ${o.status||'PROCESSING'}\nReceipt uploaded: ${o.receiptUploaded?'YES':'NO'}\n\nTo upload the MAIN RECEIPT, send a photo to this Admin Bot with caption: RECEIPT ${o.orderNumber}`,adminBotMainOrderKeyboard(o.orderNumber,!!o.receiptUploaded));
      }
      return;
    }
    if (data.startsWith('ab:main-receipt-help:')) {
      const orderNumber=data.slice('ab:main-receipt-help:'.length);
      await sendAdminBotMessage(`📎 Send the receipt photo in this Admin Bot chat with this exact caption:\nRECEIPT ${orderNumber}`); return;
    }
    if (data.startsWith('ab:main-complete:')) {
      const orderNumber=data.slice('ab:main-complete:'.length);
      const order=await markOrderCompleted(orderNumber);
      const record=completedMessage(order); await sendAdminBotMessage(record,adminBotMenuKeyboard()); await sendTransactionRecord(record); return;
    }
    const actions = {'ab:topup-approve':'retailer_topup_approve','ab:topup-reject':'retailer_topup_reject','ab:order-complete':'retailer_complete','ab:order-reject':'retailer_reject'};
    const match=data.match(/^(ab:topup-approve|ab:topup-reject|ab:order-complete|ab:order-reject):(\d+)$/);
    if(match) {
      const action=actions[match[1]], result=await handleRetailerTelegramAction(`${action}:${match[2]}`,sendAdminBotMessage); return;
    }
  } catch(e) {
    console.error('Admin bot callback failed:',e.message);
    try { await sendAdminBotMessage(`❌ Admin action failed: ${e.message||'Unknown error'}`, adminBotMenuKeyboard()); } catch (notifyError) { console.error('Could not notify admin about callback failure:', notifyError.message); }
  }
}
let adminBotOffset=0, adminBotPollingStarted=false, adminBotConflictLogged=false;
async function startAdminBotPolling() {
  if(adminBotPollingStarted || !process.env.TELEGRAM_ADMIN_BOT_TOKEN || !adminBotAllowedUserId()) return;
  adminBotPollingStarted=true;
  console.log('Separate Telegram admin bot polling enabled.');
  try { await configureAdminBotMenu(); } catch(e) { console.error('Admin bot menu setup failed:',e.message); }
  while(true) {
    try {
      const token=String(process.env.TELEGRAM_ADMIN_BOT_TOKEN).trim();
      const response=await fetch(`https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${adminBotOffset}`, {signal:AbortSignal.timeout(35000)});
      let data;
      try { data=await response.json(); } catch { throw new Error(`Telegram returned HTTP ${response.status} without valid JSON`); }
      if(!response.ok || !data.ok) {
        const description=String(data.description||'');
        if(data.error_code===409 || /Conflict: terminated by other getUpdates request/i.test(description)) {
          if(!adminBotConflictLogged) console.error('Admin Telegram bot polling conflict: another running instance is using this bot token. Stop the duplicate instance; retrying in 60 seconds.');
          adminBotConflictLogged=true;
          await new Promise(r=>setTimeout(r,60000));
          continue;
        }
        throw new Error(JSON.stringify(data));
      }
      adminBotConflictLogged=false;
      for(const update of data.result||[]) {
        adminBotOffset=update.update_id+1;
        if(update.callback_query) await handleAdminBotCallback(update.callback_query);
        if(update.message?.photo) await handleAdminBotReceipt(update.message);
        if(update.message?.text) await handleAdminBotCommand(update.message);
      }
    } catch(e) {
      console.error('Admin Telegram bot polling error:',e.message||e);
      await new Promise(r=>setTimeout(r,10000));
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
          message
        );
      } else {
        await sendTelegramMessage(message);
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

      // Notify the separate admin bot as well; the alert always carries the panel buttons.
      try {
        await sendAdminBotMessage(`🆕 NEW WEBSITE ORDER\nOrder: ${orderNumber}\nStatus: PROCESSING\nPayment screenshot uploaded: ${req.file ? 'YES' : 'NO'}\n\nOpen the Admin Panel below to review and manage this order.`, adminBotAlertKeyboard());
      } catch (e) { console.error('Admin bot website-order alert failed:', e.message); }

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
app.post("/api/retailer/push/subscribe", requireRetailer, express.json({limit:"100kb"}), async (req,res) => {
  try {
    if (!pool || !vapidPublicKey || !vapidPrivateKey) return res.status(503).json({ok:false,error:"Push notifications are not configured on the server yet."});
    const subscription=req.body?.subscription; const endpoint=String(subscription?.endpoint||"");
    if(!endpoint || !subscription?.keys) return res.status(400).json({ok:false,error:"Invalid push subscription."});
    await pool.query(`INSERT INTO eloading_push_subscriptions(endpoint,order_number,subscription,retailer_user_id) VALUES($1,'',$2::jsonb,$3) ON CONFLICT(endpoint) DO UPDATE SET subscription=EXCLUDED.subscription,retailer_user_id=EXCLUDED.retailer_user_id`,[endpoint,JSON.stringify(subscription),req.retailer.id]);
    res.json({ok:true});
  } catch(e) { console.error("Retailer push subscription failed:",e.message); res.status(500).json({ok:false,error:"Could not save notification settings."}); }
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

app.get("/admin", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ronald E-Loading Admin</title>
<style>
:root{font-family:Arial,sans-serif;color:#182235;background:#f2f5fa}*{box-sizing:border-box}body{margin:0;padding:16px}main{max-width:1180px;margin:auto}.card{background:#fff;border:1px solid #e1e7f0;border-radius:14px;padding:16px;margin:0 0 16px;box-shadow:0 4px 18px #1822350b}h1{font-size:24px;margin:0 0 8px}h2{font-size:19px;margin:0 0 12px}.muted{color:#64748b;font-size:14px}input,button{font:inherit;border-radius:8px;padding:10px;border:1px solid #cbd5e1}input{max-width:100%}button{cursor:pointer;background:#163f8c;color:white;border:0;font-weight:700;margin:2px}button.secondary{background:#e8eef8;color:#19345e}button.danger{background:#b42318}button:disabled{opacity:.5;cursor:wait}.login{max-width:440px;margin:9vh auto}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.row input{flex:1;min-width:160px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.stat{background:#f7f9fd;border-radius:10px;padding:12px}.stat strong{display:block;font-size:22px;margin-top:4px}.tablewrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:700px}th,td{padding:10px;border-bottom:1px solid #e7ebf2;text-align:left;font-size:13px}th{background:#f7f9fc}.pill{display:inline-block;padding:4px 7px;border-radius:20px;background:#eef2f7;font-size:12px}.ok{color:#087443}.err{color:#b42318}.hidden{display:none!important}.sectionhead{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.notice{margin-top:10px;font-size:14px;white-space:pre-wrap}@media(max-width:600px){body{padding:9px}h1{font-size:21px}.card{padding:12px}}
</style></head><body><main>
<section id="login" class="card login"><h1>🛠 RONALD E-LOADING ADMIN</h1><p class="muted">Enter the private ADMIN_KEY configured on the backend. Do not share it with retailers.</p><form id="loginForm" class="row"><input id="keyInput" type="password" autocomplete="current-password" placeholder="Admin password / key" required><button>Unlock</button></form><div id="loginMsg" class="notice"></div></section>
<div id="dashboard" class="hidden"><section class="card"><div class="sectionhead"><div><h1>🛠 RONALD E-LOADING ADMIN</h1><p class="muted">Manage top-ups, retailer orders, and wallet balances here. Changes are recorded in the wallet ledger.</p></div><button id="refreshBtn" class="secondary">↻ Refresh</button><button id="logoutBtn" class="danger">Lock / Log out</button></div><div id="pageMsg" class="notice"></div></section>
<section class="card"><div class="grid"><div class="stat">Retailers<strong id="statUsers">—</strong></div><div class="stat">Pending top-ups<strong id="statTopups">—</strong></div><div class="stat">Processing orders<strong id="statOrders">—</strong></div></div></section>
<section class="card"><h2>💳 Top-up Requests</h2><div class="tablewrap"><table><thead><tr><th>Request</th><th>Retailer</th><th>Amount</th><th>Method / Reference</th><th>Status</th><th>Action</th></tr></thead><tbody id="topupsBody"></tbody></table></div></section>
<section class="card"><h2>🛒 Retailer Orders</h2><div class="tablewrap"><table><thead><tr><th>Order</th><th>Retailer</th><th>Promo / Network</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody id="ordersBody"></tbody></table></div></section>
<section class="card"><h2>👥 Retailers & Wallet Balances</h2><div class="tablewrap"><table><thead><tr><th>ID</th><th>Store / Username</th><th>Balance</th><th>Account</th></tr></thead><tbody id="usersBody"></tbody></table></div></section>
<section class="card"><h2>💰 Add / Deduct Wallet Balance</h2><p class="muted">Enter the numeric retailer ID (for example, 12 for RET-12). Use a positive amount to add and a negative amount to deduct.</p><form id="walletForm" class="row"><input id="walletUserId" type="number" min="1" step="1" placeholder="Retailer ID e.g. 12" required><input id="walletAmount" type="number" min="-50000" max="50000" step="0.01" placeholder="Amount e.g. 500 or -50" required><input id="walletReason" maxlength="200" placeholder="Reason / note" required><button>Apply Adjustment</button></form></section>
</div></main>
<script>
(function(){
const $=id=>document.getElementById(id);let key=sessionStorage.getItem('ronald_admin_key')||'';
const money=c=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(c||0)/100);
const esc=v=>String(v==null?'':v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
function msg(id,text,error){$(id).textContent=text||'';$(id).className='notice '+(error?'err':'ok');}
async function api(path,method='GET',body){const r=await fetch(path,{method,headers:{'x-admin-key':key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});let d={};try{d=await r.json()}catch(_){}if(!r.ok)throw new Error(d.error||'Request failed ('+r.status+').');return d;}
function actionButton(label,cls,fn){return '<button class="'+(cls||'')+'" data-action="'+fn+'">'+label+'</button>';}
async function load(){msg('pageMsg','Loading admin data…',false);try{const d=await api('/api/retailer/admin/overview');const users=d.users||[],topups=d.topups||[],orders=d.orders||[]; $('statUsers').textContent=users.length;$('statTopups').textContent=topups.filter(t=>t.status==='PENDING').length;$('statOrders').textContent=orders.filter(o=>o.status==='PROCESSING'&&!o.debited_at).length;
$('topupsBody').innerHTML=topups.map(t=>'<tr><td>#'+esc(t.id)+'</td><td>'+esc(t.display_name)+'<br><span class="muted">RET-'+esc(t.user_id)+' / @'+esc(t.username)+'</span></td><td>'+money(t.amount_cents)+'</td><td>'+esc(t.method)+'<br><span class="muted">'+esc(t.reference||'No reference')+'</span></td><td><span class="pill">'+esc(t.status)+'</span></td><td>'+(t.status==='PENDING'?actionButton('Approve','','approve-topup:'+t.id)+actionButton('Reject','danger','reject-topup:'+t.id):'—')+'</td></tr>').join('')||'<tr><td colspan="6">No top-up requests.</td></tr>';
$('ordersBody').innerHTML=orders.map(o=>'<tr><td>'+esc(o.order_number||('#'+o.id))+'</td><td>'+esc(o.display_name)+'<br><span class="muted">RET-'+esc(o.user_id)+' / @'+esc(o.username)+'</span></td><td>'+esc(o.network||o.promo||o.description||'Retailer order')+'</td><td>'+money(o.amount_cents)+'</td><td><span class="pill">'+esc(o.status)+'</span></td><td>'+(o.status==='PROCESSING'&&!o.debited_at?actionButton('Completed + Deduct','','complete-order:'+o.id)+actionButton('Reject','danger','reject-order:'+o.id):'—')+'</td></tr>').join('')||'<tr><td colspan="6">No retailer orders.</td></tr>';
$('usersBody').innerHTML=users.map(u=>'<tr><td>RET-'+esc(u.id)+'</td><td>'+esc(u.display_name)+'<br><span class="muted">@'+esc(u.username)+'</span></td><td><b>'+money(u.wallet_cents)+'</b></td><td><span class="pill">'+(u.active?'ACTIVE':'DISABLED')+'</span></td></tr>').join('')||'<tr><td colspan="4">No retailers.</td></tr>';
msg('pageMsg','Admin data loaded.',false);
}catch(e){msg('pageMsg',e.message,true);if(/authorization|unauthorized/i.test(e.message)){sessionStorage.removeItem('ronald_admin_key');key='';showLogin();}}}
function showLogin(){$('login').classList.remove('hidden');$('dashboard').classList.add('hidden');$('keyInput').value='';}
function showDashboard(){$('login').classList.add('hidden');$('dashboard').classList.remove('hidden');}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();key=$('keyInput').value;try{await api('/api/retailer/admin/overview');sessionStorage.setItem('ronald_admin_key',key);showDashboard();await load();}catch(err){key='';msg('loginMsg','Could not unlock: '+err.message,true);}});
$('refreshBtn').addEventListener('click',load);$('logoutBtn').addEventListener('click',()=>{sessionStorage.removeItem('ronald_admin_key');key='';showLogin();msg('loginMsg','Admin panel locked.',false);});
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-action]');if(!b)return;const [action,id]=b.dataset.action.split(':');if(!confirm('Confirm '+action.replaceAll('-',' ')+' for request/order #'+id+'?'))return;b.disabled=true;try{if(action==='approve-topup')await api('/api/retailer/admin/topups/'+id+'/approve','POST',{});if(action==='reject-topup')await api('/api/retailer/admin/topups/'+id+'/reject','POST',{});if(action==='complete-order')await api('/api/retailer/admin/orders/'+id+'/complete','POST',{});if(action==='reject-order')await api('/api/retailer/admin/orders/'+id+'/reject','POST',{});await load();}catch(err){msg('pageMsg',err.message,true);b.disabled=false;}});
$('walletForm').addEventListener('submit',async e=>{e.preventDefault();const userId=Number($('walletUserId').value),amount=Number($('walletAmount').value),reason=$('walletReason').value.trim();if(!confirm('Confirm wallet adjustment of '+new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(amount)+' for RET-'+userId+'?'))return;try{await api('/api/retailer/admin/wallet-adjust','POST',{userId,amount,reason});$('walletForm').reset();msg('pageMsg','Wallet adjustment saved.',false);await load();}catch(err){msg('pageMsg',err.message,true);}});
if(key){showDashboard();load();}else showLogin();
})();
</script></body></html>`);
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
const retailerCatalog = require('./retailer-catalog.json');
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
  await pool.query(`CREATE TABLE IF NOT EXISTS eloading_push_subscriptions (endpoint TEXT PRIMARY KEY, order_number TEXT NOT NULL DEFAULT '', subscription JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), retailer_user_id BIGINT)`);
  await pool.query(`ALTER TABLE eloading_push_subscriptions ADD COLUMN IF NOT EXISTS retailer_user_id BIGINT`);
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
  res.setHeader('Set-Cookie', `${RETAILER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=31536000`);
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
const allowedPaymentMethods = ['GCash','Maya','GoTyme Bank','MariBank','QR PH'];
app.get('/api/retailer/catalog', (req,res) => res.json(retailerCatalog));
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
    const result=await pool.query('INSERT INTO retailer_users(username,display_name,password_hash) VALUES($1,$2,$3) RETURNING id,username,display_name,wallet_cents,active,created_at',[username,displayName,passwordHash(password)]);
    const token=crypto.randomBytes(32).toString('hex');
    await pool.query(`INSERT INTO retailer_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '365 days')`,[hashText(token),result.rows[0].id]);
    const created=result.rows[0];
    const accountRecord = `🆕 NEW RETAILER ACCOUNT CREATED
Retailer ID: RET-${created.id}
Store name: ${created.display_name}
Username: @${created.username}
Created: ${manilaDateTime(new Date(created.created_at || Date.now()))}
Starting wallet: ₱0.00
Security: password is not sent or stored in readable form.`;
    try { await sendTransactionRecord(accountRecord); } catch(e) { console.error('Telegram new-retailer notification failed:',e.message); }
    try { await sendAdminBotMessage(accountRecord, adminBotAlertKeyboard()); } catch(e) { console.error('Admin bot new-retailer alert failed:',e.message); }
    setRetailerCookie(res,token); res.status(201).json({ok:true,user:created});
  } catch(e) { if(e.code==='23505') return res.status(409).json({error:'Username already exists. Please choose another.'}); console.error(e); res.status(503).json({error:e.message||'Registration failed.'}); }
});
app.post('/api/retailer/login', express.json({limit:'20kb'}), async (req,res) => {
  try {
    await initRetailerDb(); const username=String(req.body?.username||'').trim().toLowerCase(); const password=String(req.body?.password||'');
    const r=await pool.query('SELECT * FROM retailer_users WHERE username=$1',[username]); const user=r.rows[0];
    if(!user || !user.active || !verifyPassword(password,user.password_hash)) return res.status(401).json({error:'Incorrect username or password.'});
    const token=crypto.randomBytes(32).toString('hex'); await pool.query(`INSERT INTO retailer_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '365 days')`,[hashText(token),user.id]);
    setRetailerCookie(res,token); res.json({ok:true,user:{id:user.id,username:user.username,display_name:user.display_name,wallet_cents:user.wallet_cents}});
  } catch(e) { console.error(e); res.status(503).json({error:e.message||'Login failed.'}); }
});
app.post('/api/retailer/logout', async (req,res) => { try { const token=cookieToken(req); if(pool&&token) await pool.query('DELETE FROM retailer_sessions WHERE token_hash=$1',[hashText(token)]); res.setHeader('Set-Cookie',`${RETAILER_COOKIE}=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0`); res.json({ok:true}); } catch(e){res.status(500).json({error:'Could not log out.'});} });
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
    // No customer push notification for pending top-ups; notify only after approval and wallet credit.
    const note=`🕒 TOP-UP REQUEST SUBMITTED
Request #${t.id}
Retailer ID: RET-${req.retailer.id}
Store: ${req.retailer.display_name} (@${req.retailer.username})
Amount: ₱${peso(t.amount_cents)}
Method: ${method}
Reference: ${reference||'Not provided'}
Status: PENDING — wallet balance has NOT been added yet.`;
    try { await sendTelegramPhoto(req.file.path,req.file.originalname,req.file.mimetype,note); } catch(e) { console.error('Top-up Telegram alert failed:',e.message); try { await sendTelegramMessage(note); } catch(_) {} }
    try { await sendAdminBotPhoto(req.file.path,req.file.originalname,req.file.mimetype, note + '\n\nUse the Admin Panel buttons below to approve or reject.', adminBotAlertKeyboard()); }
    catch(e) { console.error('Admin bot top-up alert failed:',e.message); try { await sendAdminBotMessage(note, adminBotAlertKeyboard()); } catch(_) {} }
    await sendTransactionRecord(note);
    res.status(201).json({ok:true,topup:t,message:'Top-up request submitted. Your wallet will increase only after admin approval.'});
  } catch(e){console.error(e);res.status(500).json({error:'Could not submit top-up request.'});}
});
app.post('/api/retailer/orders', requireRetailer, express.json({limit:'20kb'}), async (req,res) => {
  try {
    const b=req.body||{}; const customer=String(b.customerName||'').trim().slice(0,80); const mobile=String(b.mobile||'').replace(/\D/g,''); const network=String(b.network||'').trim().slice(0,40); const promo=String(b.promo||'').trim().slice(0,120); const amount=Number(b.amount); const notes=String(b.notes||'').trim().slice(0,300);
    if(!customer||!network||!promo||!Number.isFinite(amount)||amount<=0||amount>50000) return res.status(400).json({error:'Complete all order fields and enter a valid amount.'});
    if(!/^\d{11}$/.test(mobile)) return res.status(400).json({error:'Mobile number must contain exactly 11 digits.'});
    const networkPromos = retailerCatalog.promos[network];
    const matchingPromo = Array.isArray(networkPromos) ? networkPromos.find(item => String(item[0]) === promo && Math.round(Number(item[2]) * 100) === cents(amount)) : null;
    if (!matchingPromo) return res.status(400).json({error:'Invalid promo or price. Please select a promo from the current catalog.'});
    // Pending orders do not debit the wallet, but their value is reserved when checking
    // new orders so multiple pending orders cannot knowingly exceed available funds.
    const bal=await pool.query(`SELECT u.wallet_cents, COALESCE(SUM(o.amount_cents),0) AS pending_cents FROM retailer_users u LEFT JOIN retailer_orders o ON o.user_id=u.id AND o.status='PROCESSING' AND o.debited_at IS NULL WHERE u.id=$1 GROUP BY u.id`,[req.retailer.id]);
    const available=Number(bal.rows[0]?.wallet_cents||0)-Number(bal.rows[0]?.pending_cents||0);
    if(available<cents(amount)) return res.status(400).json({error:`Insufficient available balance. Available after pending orders: ₱${peso(available)}. Please top up first.`});
    const orderNo='R-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(2).toString('hex').toUpperCase();
    const r=await pool.query(`INSERT INTO retailer_orders(order_number,user_id,customer_name,mobile,network,promo,amount_cents,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[orderNo,req.retailer.id,customer,mobile,network,promo,cents(amount),notes]);
    const o=r.rows[0];
    // No customer push notification for pending load orders; notify only after successful completion.
    const orderNotice = `🕒 RETAILER LOAD ORDER SUBMITTED
Order ID: ${o.id}
Order: ${orderNo}
Retailer ID: RET-${req.retailer.id}
Retailer: ${req.retailer.display_name} (@${req.retailer.username})
Customer: ${customer}
Mobile: ${mobile}
Network: ${network}
Promo: ${promo}
Amount: ₱${peso(o.amount_cents)}
Status: PROCESSING — wallet is not deducted until marked completed.`;
    try { await sendTransactionRecord(orderNotice); } catch(e){console.error('Telegram order history alert failed:',e.message);}
    try { await sendAdminBotMessage(orderNotice + '\n\nOpen the panel below to manage this order.', adminBotAlertKeyboard()); } catch(e){console.error('Admin bot order alert failed:',e.message);}
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
    await client.query(`INSERT INTO retailer_wallet_ledger(user_id,kind,amount_cents,reference,description) VALUES($1,'TOPUP',$2,$3,$4)`,[t.user_id,t.amount_cents,`TOPUP-${t.id}`,`Approved ${t.method} top-up`]); await client.query('COMMIT'); await sendRetailerPush(t.user_id, 'TOP-UP SUCCESSFUL', `₱${peso(t.amount_cents)} has been added to your wallet.`, `topup-${t.id}-successful`); await sendTransactionRecord(`✅ TOP-UP APPROVED VIA WEBSITE ADMIN\nRequest: #${t.id}\nRetailer ID: RET-${t.user_id}\nAmount added: ₱${peso(t.amount_cents)}\nMethod: ${t.method}`); res.json({ok:true});
  } catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});} finally{client.release();}
});
app.post('/api/retailer/admin/topups/:id/reject', express.json({limit:'10kb'}), async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  try { const r=await pool.query(`UPDATE retailer_topups SET status='REJECTED',reviewed_at=NOW(),reviewed_by='admin' WHERE id=$1 AND status='PENDING' RETURNING id,user_id,amount_cents`,[req.params.id]); if(!r.rowCount)return res.status(400).json({error:'Request not found or already reviewed.'}); await sendTransactionRecord(`❌ TOP-UP REJECTED VIA WEBSITE ADMIN\nRequest: #${r.rows[0].id}\nRetailer ID: RET-${r.rows[0].user_id}\nNo wallet balance was added.`); res.json({ok:true}); } catch(e){res.status(500).json({error:'Could not reject request.'});}
});
app.post('/api/retailer/admin/orders/:id/complete', express.json({limit:'10kb'}), async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  const client=await pool.connect(); try { await client.query('BEGIN'); const q=await client.query('SELECT * FROM retailer_orders WHERE id=$1 FOR UPDATE',[req.params.id]); const o=q.rows[0]; if(!o) throw new Error('Order not found.'); if(o.status==='COMPLETED' || o.debited_at) throw new Error('This order has already been completed and charged.'); if(o.status!=='PROCESSING') throw new Error('Only processing orders can be completed.');
    const u=await client.query('SELECT wallet_cents FROM retailer_users WHERE id=$1 FOR UPDATE',[o.user_id]); if(Number(u.rows[0].wallet_cents)<Number(o.amount_cents)) throw new Error('Retailer wallet has insufficient funds. The order cannot be completed or charged.');
    await client.query('UPDATE retailer_users SET wallet_cents=wallet_cents-$1 WHERE id=$2',[o.amount_cents,o.user_id]); await client.query(`UPDATE retailer_orders SET status='COMPLETED',completed_at=NOW(),debited_at=NOW() WHERE id=$1`,[o.id]);
    await client.query(`INSERT INTO retailer_wallet_ledger(user_id,kind,amount_cents,reference,description) VALUES($1,'ORDER_DEBIT',$2,$3,$4)`,[o.user_id,-Number(o.amount_cents),`ORDER-${o.order_number}`,`Completed loading order ${o.order_number}`]); await client.query('COMMIT');
    await sendRetailerPush(o.user_id, 'LOAD SUCCESSFUL', `Your load order ${o.order_number} was marked successful.`, `load-${o.id}-successful`); await sendTransactionRecord(`✅ RETAILER ORDER COMPLETED VIA WEBSITE ADMIN\n${o.order_number}\nRetailer ID: RET-${o.user_id}\nAmount ₱${peso(o.amount_cents)} deducted only after completion.`); res.json({ok:true});
  } catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});} finally{client.release();}
});
app.post('/api/retailer/admin/orders/:id/reject', express.json({limit:'10kb'}), async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  try { const r=await pool.query(`UPDATE retailer_orders SET status='REJECTED' WHERE id=$1 AND status='PROCESSING' AND debited_at IS NULL RETURNING id,order_number,user_id`,[req.params.id]); if(!r.rowCount)return res.status(400).json({error:'Order not found or already reviewed.'}); await sendTransactionRecord(`❌ RETAILER ORDER REJECTED VIA WEBSITE ADMIN\nOrder: ${r.rows[0].order_number}\nRetailer ID: RET-${r.rows[0].user_id}\nNo wallet deduction was made.`); res.json({ok:true}); } catch(e){res.status(500).json({error:'Could not reject order.'});}
});
app.post('/api/retailer/admin/wallet-adjust', express.json({limit:'10kb'}), async (req,res) => {
  if(!adminAuthorized(req)) return res.status(401).json({error:'Admin authorization required.'});
  const userId=Number(req.body?.userId), amount=Number(req.body?.amount), reason=String(req.body?.reason||'Manual admin adjustment').trim().slice(0,200);
  if(!Number.isInteger(userId)||!Number.isFinite(amount)||amount===0||Math.abs(amount)>50000)return res.status(400).json({error:'Enter a valid user ID and non-zero adjustment amount.'});
  const client=await pool.connect();try{await client.query('BEGIN');const u=await client.query('SELECT wallet_cents FROM retailer_users WHERE id=$1 FOR UPDATE',[userId]);if(!u.rowCount)throw new Error('Retailer not found.');const adj=cents(amount);if(Number(u.rows[0].wallet_cents)+adj<0)throw new Error('Adjustment would make the wallet negative.');await client.query('UPDATE retailer_users SET wallet_cents=wallet_cents+$1 WHERE id=$2',[adj,userId]);const ref=`ADJ-${userId}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;await client.query(`INSERT INTO retailer_wallet_ledger(user_id,kind,amount_cents,reference,description) VALUES($1,'ADMIN_ADJUSTMENT',$2,$3,$4)`,[userId,adj,ref,reason]);await client.query('COMMIT');await sendTransactionRecord(`💰 WALLET UPDATED VIA WEBSITE ADMIN\nRetailer ID: RET-${userId}\nAdjustment: ${amount>0?'+':''}₱${peso(Math.abs(adj))}\nReason: ${reason}\nReference: ${ref}`);res.json({ok:true});}catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message});}finally{client.release();}
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
      // Strict separation: TELEGRAM_BOT_TOKEN only sends notifications.
      // All admin commands, callbacks, receipt uploads and order management run on TELEGRAM_ADMIN_BOT_TOKEN.
      startAdminBotPolling();
    });
  } catch (e) {
    console.error("Database initialization failed:", e);
    process.exit(1);
  }
})();



