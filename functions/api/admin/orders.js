import { json, requireShopAdmin } from "../../_lib/access.js";
const STATUSES = new Set(["new", "quoted", "awaiting_payment", "paid", "fulfilled", "cancelled"]);
export async function onRequestGet({ request, env }) {
  const admin = await requireShopAdmin(request, env);
  if (!admin) return json({ error: "Access denied." }, 403);
  if (!env.SHOP_DB || env.SHOP_ENV !== "production") return json({ error: "Shop administration is not enabled here." }, 503);
  try {
    const ordersResult = await env.SHOP_DB.prepare(
      "SELECT id, order_ref, created_at, updated_at, status, currency, customer_name, customer_email, delivery_country, delivery_postcode, customer_note, admin_note, quoted_total_pence, paid_at, fulfilled_at FROM shop_orders ORDER BY created_at DESC LIMIT 100"
    ).all();
    const orders = ordersResult.results || [];
    const ids = orders.map(order => order.id);
    let items = [];
    let events = [];
    if (ids.length) {
      const slots = ids.map(() => "?").join(",");
      const itemsResult = await env.SHOP_DB.prepare(
        "SELECT id, order_id, product_id, product_title, quantity, options FROM shop_order_items WHERE order_id IN (" + slots + ") ORDER BY rowid"
      ).bind(...ids).all();
      items = itemsResult.results || [];
      const eventsResult = await env.SHOP_DB.prepare(
        "SELECT order_id, event_type, actor_email, note, created_at FROM shop_order_events WHERE order_id IN (" + slots + ") ORDER BY created_at DESC"
      ).bind(...ids).all();
      events = eventsResult.results || [];
    }
    return json({ orders: orders.map(order => ({ ...order, items: items.filter(item => item.order_id === order.id), events: events.filter(event => event.order_id === order.id) })) });
  } catch { return json({ error: "Could not load orders." }, 500); }
}
export async function onRequestPatch({ request, env }) {
  const admin = await requireShopAdmin(request, env);
  if (!admin) return json({ error: "Access denied." }, 403);
  if (!env.SHOP_DB || env.SHOP_ENV !== "production") return json({ error: "Shop administration is not enabled here." }, 503);
  let body;
  try {
    const raw = await request.text();
    if (raw.length > 5000) return json({ error: "Request is too large." }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: "Invalid JSON." }, 400); }
  const id = String(body.id || "");
  const status = String(body.status || "");
  const adminNote = String(body.adminNote || "").trim();
  const quoteValue = body.quotedTotalPence === "" || body.quotedTotalPence === null || body.quotedTotalPence === undefined ? null : Number(body.quotedTotalPence);
  if (!id || id.length > 64) return json({ error: "Invalid order." }, 400);
  if (!STATUSES.has(status)) return json({ error: "Invalid status." }, 400);
  if (adminNote.length > 1000) return json({ error: "Admin note must be 1,000 characters or fewer." }, 400);
  if (quoteValue !== null && (!Number.isInteger(quoteValue) || quoteValue < 1 || quoteValue > 10000000)) return json({ error: "Enter a valid GBP total in pence, or leave it blank." }, 400);
  try {
    const current = await env.SHOP_DB.prepare("SELECT id, status, quoted_total_pence FROM shop_orders WHERE id = ?").bind(id).first();
    if (!current) return json({ error: "Order not found." }, 404);
    if ((status === "awaiting_payment" || status === "paid") && quoteValue === null && current.quoted_total_pence === null) return json({ error: "Set a GBP quotation before awaiting or recording payment." }, 400);
    const now = new Date().toISOString();
    const paidAt = status === "paid" && current.status !== "paid" ? now : null;
    const fulfilledAt = status === "fulfilled" && current.status !== "fulfilled" ? now : null;
    await env.SHOP_DB.batch([
      env.SHOP_DB.prepare(
        "UPDATE shop_orders SET status = ?, admin_note = ?, quoted_total_pence = ?, updated_at = ?, paid_at = COALESCE(?, paid_at), fulfilled_at = COALESCE(?, fulfilled_at) WHERE id = ?"
      ).bind(status, adminNote, quoteValue, now, paidAt, fulfilledAt, id),
      env.SHOP_DB.prepare(
        "INSERT INTO shop_order_events (id, order_id, event_type, actor_email, note, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), id, "status_" + status, admin.email, adminNote, now)
    ]);
    return json({ ok: true });
  } catch { return json({ error: "Could not update order." }, 500); }
}
