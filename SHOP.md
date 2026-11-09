# Headless Cedwyn shop (free-plan deployment)

The shop stays in this dedicated repository and existing Cloudflare Pages project. The public URL stays https://bucklerfamily.estate/shop/, served by the existing path proxy.

## Free-plan design

- GitHub is the source of truth for the static catalogue, product imagery, front-end and Pages Functions.
- Cloudflare Pages hosts the public storefront and serverless Functions.
- Cloudflare KV stores orders in a dedicated namespace named cedwyn-shop-orders. This keeps customer/order data separate from the existing D1 databases and uses only the Cloudflare Free allowance.
- Cloudflare Access protects the admin page and admin API using an allow-list for the account owner's existing identity.
- No Shopify, Stripe, paid add-on, paid hosting or new SaaS provider is required.

## Important checkout boundary

This version is a request-to-order workflow, not a card-payment checkout. It collects a name, email, country, postcode, chosen products and a short note. It does not collect a full postal address or payment-card details. It assigns an order reference and records a new request. The operator must review the request, confirm product/variant availability, calculate a GBP quote including delivery, send the quotation and arrange payment outside the website. Only mark an order paid after independently confirming cleared funds. Production and dispatch remain manual.

The prices shown by the former Printify Pop-Up Store are not converted or carried over. The admin quote field stores GBP pence. Product selling prices remain unquoted until confirmed. Order records are individual KV values; KV is eventually consistent rather than a transactional SQL database.

## First deployment setup

1. A dedicated KV namespace named cedwyn-shop-orders is bound to the production Pages Functions as SHOP_ORDERS. No D1 database or existing research/enquiry data is used.
2. Keep the SHOP_ORDERS KV binding production-only. Do not add it to preview deployments.
3. Set SHOP_ENV=preview in the preview deployment and SHOP_ENV=production in production. Preview has no SHOP_ORDERS binding and order writes are deliberately disabled.
4. Create two Cloudflare Access self-hosted applications for the canonical paths /shop/admin* and /shop/api/admin*, each with an allow policy for the account owner's verified identity.
5. Set SHOP_ACCESS_AUD to the Access audience tag for the API application and SHOP_ADMIN_EMAIL to the allowed email address in the production Pages environment.
6. The admin page is https://bucklerfamily.estate/shop/admin/ and uses the existing Cloudflare Access identity. Deploy and test the public request flow, Access-protected admin queue, status changes, GBP quotations, and path-proxy asset/API URLs before enabling production requests. There are no automated customer emails in this release; the reference is shown on screen and requests appear in the admin queue.

Workers KV Free limits currently include 100,000 reads/day, 1,000 writes/day, 1,000 list requests/day and 1 GB storage. Monitor usage and do not exceed the free plan. Do not add an API token, payment credential, customer record, bank detail or secret to this repository.
