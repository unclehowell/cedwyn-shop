import { json, requireShopAdmin } from "../../_lib/access.js";

const STATUSES = new Set(["new", "quoted", "awaiting_payment", "paid", "fulfilled", "cancelled"]);

export async function onRequestGet({ request, env }) {
  const admin = await requireShopAdmin(request, env);
  if (!admin) return json({ error: "Access denied." }, 403);
  if (!env.SHOP_ORDERS || env.SHOP_ENV !== "production") {
    return json({ error: "Shop administration is not enabled here." }, 503);
  }

  try {
    const listing = await env.SHOP_ORDERS.list({ prefix: "order:", limit: 100 });
    const records = await Promise.all(
      listing.keys.map(key => env.SHOP_ORDERS.get(key.name, { type: "json" }))
    );
    const orders = records.filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return json({ orders });
  } catch {
    return json({ error: "Could not load orders." }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  const admin = await requireShopAdmin(request, env);
  if (!admin) return json({ error: "Access denied." }, 403);
  if (!env.SHOP_ORDERS || env.SHOP_ENV !== "production") {
    return json({ error: "Shop administration is not enabled here." }, 503);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 5000) return json({ error: "Request is too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  const id = String(body.id || "");
  const status = String(body.status || "");
  const adminNote = String(body.adminNote || "").trim();
  const quoteValue = body.quotedTotalPence === "" || body.quotedTotalPence === null || body.quotedTotalPence === undefined
    ? null : Number(body.quotedTotalPence);

  if (!id.startsWith("order:") || id.length > 180) return json({ error: "Invalid order." }, 400);
  if (!STATUSES.has(status)) return json({ error: "Invalid status." }, 400);
  if (adminNote.length > 1000) return json({ error: "Admin note must be 1,000 characters or fewer." }, 400);
  if (quoteValue !== null && (!Number.isInteger(quoteValue) || quoteValue < 1 || quoteValue > 10000000)) {
    return json({ error: "Enter a valid GBP total in pence, or leave it blank." }, 400);
  }

  try {
    const current = await env.SHOP_ORDERS.get(id, { type: "json" });
    if (!current) return json({ error: "Order not found." }, 404);
    if ((status === "awaiting_payment" || status === "paid") &&
      quoteValue === null && current.quoted_total_pence === null) {
      return json({ error: "Set a GBP quotation before awaiting or recording payment." }, 400);
    }

    const now = new Date().toISOString();
    const paidAt = status === "paid" && current.status !== "paid" ? now : current.paid_at;
    const fulfilledAt = status === "fulfilled" && current.status !== "fulfilled" ? now : current.fulfilled_at;
    const updated = {
      ...current,
      status,
      admin_note: adminNote,
      quoted_total_pence: quoteValue === null ? current.quoted_total_pence : quoteValue,
      updated_at: now,
      paid_at: paidAt,
      fulfilled_at: fulfilledAt,
      events: [
        ...(Array.isArray(current.events) ? current.events : []),
        { event_type: "status_" + status, actor_email: admin.email, note: adminNote, created_at: now }
      ].slice(-50)
    };

    await env.SHOP_ORDERS.put(id, JSON.stringify(updated), {
      metadata: { order_ref: updated.order_ref, status: updated.status, created_at: updated.created_at }
    });
    return json({ ok: true });
  } catch {
    return json({ error: "Could not update order." }, 500);
  }
}
