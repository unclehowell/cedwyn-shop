function decodePart(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return atob(padded);
}
function decodeJsonPart(value) {
  return JSON.parse(decodePart(value));
}
function decodeBytes(value) {
  const raw = decodePart(value);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
let cachedKeys = new Map();
async function getKeys(issuer) {
  const cached = cachedKeys.get(issuer);
  if (cached && cached.expires > Date.now()) return cached.keys;
  const response = await fetch(new URL("/cdn-cgi/access/certs", issuer), { cf: { cacheTtl: 3600 } });
  if (!response.ok) throw new Error("Access key lookup failed");
  const body = await response.json();
  if (!Array.isArray(body.keys)) throw new Error("Access keys missing");
  cachedKeys.set(issuer, { keys: body.keys, expires: Date.now() + 3600000 });
  return body.keys;
}
export async function requireShopAdmin(request, env) {
  try {
    if (!env.SHOP_ACCESS_AUD || !env.SHOP_ADMIN_EMAIL) return null;
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decodeJsonPart(parts[0]);
    const claims = decodeJsonPart(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;
    const issuerUrl = new URL(claims.iss);
    if (issuerUrl.protocol !== "https:" || !issuerUrl.hostname.endsWith(".cloudflareaccess.com")) return null;
    const issuer = issuerUrl.origin;
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const now = Math.floor(Date.now() / 1000);
    if (!audience.includes(env.SHOP_ACCESS_AUD)) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= now || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 30))) return null;
    if (claims.email?.toLowerCase() !== env.SHOP_ADMIN_EMAIL.toLowerCase()) return null;
    const jwk = (await getKeys(issuer)).find(key => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    const signed = new TextEncoder().encode(parts[0] + "." + parts[1]);
    const valid = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" }, key, decodeBytes(parts[2]), signed
    );
    return valid ? { email: claims.email.toLowerCase() } : null;
  } catch {
    return null;
  }
}
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
