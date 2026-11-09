import { ORDERABLE_PRODUCTS } from "../_lib/catalog.js";
import { json } from "../_lib/access.js";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
export async function onRequestPost({ request, env }) {
  if (!env.SHOP_DB || env.SHOP_ENV !== "production") return json({ error: "Order requests are not enabled on this preview." }, 503);
  const origin = request.headers.get("Origin");
  if (!origin) return json({ error: "Request origin required." }, 403);
  try {
    const parsedOrigin = new URL(origin);
    const host = parsedOrigin.hostname;
    if (parsedOrigin.protocol !== "https:" || (host !== "bucklerfamily.estate" && host !== "bucklerfamily-shop.pages.dev" && !host.endsWith(".bucklerfamily-shop.pages.dev"))) {
      return json({ error: "Request origin not allowed." }, 403);
    }
  } catch { return json({ error: "Invalid request origin." }, 403); }
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 12000) return json({ error: "Request is too large." }, 413);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) return json({ error: "JSON request required." }, 415);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return json({ error: "Request is too large." }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: "Please check the form and try again." }, 400); }
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true, message: "Request received." }, 202);
  if (body.acceptRequest !== true) return json({ error: "Please confirm that this is an order request, not a payment." }, 400);
  const name = String(body.customerName || "").trim();
  const email = String(body.customerEmail || "").trim().toLowerCase();
  const country = String(body.deliveryCountry || "").trim().toUpperCase();
  const postcode = String(body.deliveryPostcode || "").trim();
  const note = String(body.customerNote || "").trim();
  if (name.length < 2 || name.length > 100) return json({ error: "Enter your name (up to 100 characters)." }, 400);
  if (email.length > 254 || !EMAIL.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (!["GB","IE","AR","US","CA","AU","OTHER"].includes(country)) return json({ error: "Choose a delivery country." }, 400);
  if (postcode.length < 2 || postcode.length > 24) return json({ error: "Enter a valid postcode or postal code." }, 400);
  if (note.length > 600) return json({ error: "The message must be 600 characters or fewer." }, 400);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 10) return json({ error: "Choose between one and ten different products." }, 400);
  const items = [];
  const seen = new Set();
  for (const item of body.items) {
    const productId = String(item?.productId || "");
    const quantity = Number(item?.quantity);
    if (!Object.prototype.hasOwnProperty.call(ORDERABLE_PRODUCTS, productId) || seen.has(productId)) return json({ error: "One or more selected products are unavailable." }, 400);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) return json({ error: "Each product quantity must be between one and five." }, 400);
    seen.add(productId);
    items.push({ productId, title: ORDERABLE_PRODUCTS[productId], quantity });
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256(ip);
  const windowId = Math.floor(Date.now() / 900000);
  try {
    if (windowId % 96 === 0) {
      await env.SHOP_DB.prepare("DELETE FROM shop_order_rate WHERE window_id < ?").bind(windowId - 96).run();
    }
    const rate = await env.SHOP_DB.prepare(
      "INSERT INTO shop_order_rate (ip_hash, window_id, hits) VALUES (?, ?, 1) ON CONFLICT(ip_hash, window_id) DO UPDATE SET hits = hits + 1 RETURNING hits"
    ).bind(ipHash, windowId).first();
    if (!rate || rate.hits > 3) return json({ error: "Too many requests from this connection. Please try again in 15 minutes." }, 429);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const suffix = crypto.getRandomValues(new Uint8Array(4));
    const random = Array.from(suffix, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const orderRef = "CE-" + Date.now().toString(36).toUpperCase() + "-" + random;
    const statements = [
      env.SHOP_DB.prepare(
        "INSERT INTO shop_orders (id, order_ref, created_at, updated_at, status, currency, customer_name, customer_email, delivery_country, delivery_postcode, customer_note) VALUES (?, ?, ?, ?, 'new', 'GBP', ?, ?, ?, ?, ?)"
      ).bind(id, orderRef, now, now, name, email, country, postcode, note)
    ];
    for (const item of items) {
      statements.push(env.SHOP_DB.prepare(
        "INSERT INTO shop_order_items (id, order_id, product_id, product_title, quantity, options) VALUES (?, ?, ?, ?, ?, '')"
      ).bind(crypto.randomUUID(), id, item.productId, item.title, item.quantity));
    }
    statements.push(env.SHOP_DB.prepare(
      "INSERT INTO shop_order_events (id, order_id, event_type, actor_email, note, created_at) VALUES (?, ?, 'request_received', 'customer', '', ?)"
    ).bind(crypto.randomUUID(), id, now));
    await env.SHOP_DB.batch(statements);
    return json({
      ok: true, orderRef, status: "received",
      message: "Your order request has been received. No payment has been taken. We will review availability and respond with a GBP quotation."
    }, 201);
  } catch {
    return json({ error: "The request could not be saved. Please try again later." }, 500);
  }
}
