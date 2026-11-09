import { ORDERABLE_PRODUCTS } from "../_lib/catalog.js";
import { json } from "../_lib/access.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  if (!env.SHOP_ORDERS || env.SHOP_ENV !== "production") {
    return json({ error: "Order requests are not enabled on this preview." }, 503);
  }

  const origin = request.headers.get("Origin");
  if (!origin) return json({ error: "Request origin required." }, 403);
  try {
    const parsedOrigin = new URL(origin);
    const host = parsedOrigin.hostname;
    if (parsedOrigin.protocol !== "https:" || (
      host !== "bucklerfamily.estate" &&
      host !== "bucklerfamily-shop.pages.dev" &&
      !host.endsWith(".bucklerfamily-shop.pages.dev")
    )) return json({ error: "Request origin not allowed." }, 403);
  } catch {
    return json({ error: "Invalid request origin." }, 403);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 12000) return json({ error: "Request is too large." }, 413);
  if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    return json({ error: "JSON request required." }, 415);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return json({ error: "Request is too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Please check the form and try again." }, 400);
  }

  if (typeof body.website === "string" && body.website.trim()) {
    return json({ ok: true, message: "Request received." }, 202);
  }
  if (body.acceptRequest !== true) {
    return json({ error: "Please confirm that this is an order request, not a payment." }, 400);
  }

  const name = String(body.customerName || "").trim();
  const email = String(body.customerEmail || "").trim().toLowerCase();
  const country = String(body.deliveryCountry || "").trim().toUpperCase();
  const postcode = String(body.deliveryPostcode || "").trim();
  const note = String(body.customerNote || "").trim();

  if (name.length < 2 || name.length > 100) return json({ error: "Enter your name (up to 100 characters)." }, 400);
  if (email.length > 254 || !EMAIL.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (!["GB", "IE", "AR", "US", "CA", "AU", "OTHER"].includes(country)) {
    return json({ error: "Choose a delivery country." }, 400);
  }
  if (postcode.length < 2 || postcode.length > 24) return json({ error: "Enter a valid postcode or postal code." }, 400);
  if (note.length > 600) return json({ error: "The message must be 600 characters or fewer." }, 400);
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 10) {
    return json({ error: "Choose between one and ten different products." }, 400);
  }

  const items = [];
  const seen = new Set();
  for (const item of body.items) {
    const productId = String(item?.productId || "");
    const quantity = Number(item?.quantity);
    if (!Object.prototype.hasOwnProperty.call(ORDERABLE_PRODUCTS, productId) || seen.has(productId)) {
      return json({ error: "One or more selected products are unavailable." }, 400);
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) {
      return json({ error: "Each product quantity must be between one and five." }, 400);
    }
    seen.add(productId);
    items.push({
      product_id: productId,
      product_title: ORDERABLE_PRODUCTS[productId],
      quantity,
      options: ""
    });
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ipHash = await sha256(ip);
  const windowId = Math.floor(Date.now() / 900000);
  const rateKey = "rate:" + ipHash + ":" + windowId;

  try {
    const rateValue = await env.SHOP_ORDERS.get(rateKey);
    const hits = Number(rateValue || 0);
    if (!Number.isFinite(hits) || hits >= 3) {
      return json({ error: "Too many requests from this connection. Please try again in 15 minutes." }, 429);
    }
    try {
      await env.SHOP_ORDERS.put(rateKey, String(hits + 1), { expirationTtl: 1800 });
    } catch {
      return json({ error: "Please wait a moment before sending another request." }, 429);
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const id = "order:" + String(9999999999999 - nowMs).padStart(13, "0") + ":" + crypto.randomUUID();
    const orderRef = "CE-" + nowMs.toString(36).toUpperCase() + "-" +
      Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, "0")).join("").toUpperCase();

    const order = {
      id,
      order_ref: orderRef,
      created_at: now,
      updated_at: now,
      status: "new",
      currency: "GBP",
      customer_name: name,
      customer_email: email,
      delivery_country: country,
      delivery_postcode: postcode,
      customer_note: note,
      admin_note: "",
      quoted_total_pence: null,
      paid_at: null,
      fulfilled_at: null,
      items,
      events: [{ event_type: "request_received", actor_email: "customer", note: "", created_at: now }]
    };

    await env.SHOP_ORDERS.put(id, JSON.stringify(order), {
      metadata: { order_ref: orderRef, status: "new", created_at: now }
    });

    return json({
      ok: true,
      orderRef,
      status: "received",
      message: "Your order request has been received. No payment has been taken. We will review availability and respond with a GBP quotation."
    }, 201);
  } catch {
    return json({ error: "The request could not be saved. Please try again later." }, 500);
  }
}
