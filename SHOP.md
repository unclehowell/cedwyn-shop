# Headless Cedwyn shop (free-plan deployment)

The shop stays in this dedicated repository and existing Cloudflare Pages project. The public URL stays https://bucklerfamily.estate/shop/, served by the existing path proxy.

## Free-plan design

- GitHub is the source of truth for the static catalogue, product imagery, front-end and Pages Functions.
- Cloudflare Pages hosts the public storefront and serverless Functions.
- Cloudflare D1 stores private order requests in isolated shop_* tables in the existing ghf-enquiries database. The account already has ten D1 databases; do not create an eleventh or use the Great House research-catalogue tables.
- Cloudflare Access protects the admin page and admin API using an allow-list for the account owner's existing identity.
- No Shopify, Stripe, paid add-on, paid hosting or new SaaS provider is required.

## Important checkout boundary

This version is a request-to-order workflow, not a card-payment checkout. It collects a name, email, country, postcode, chosen products and a short note. It does not collect a full postal address or payment-card details. It assigns an order reference and records a new request. The operator must review the request, confirm product/variant availability, calculate a GBP quote including delivery, send the quotation and arrange payment outside the website. Only mark an order paid after independently confirming cleared funds. Production and dispatch remain manual.

The prices shown by the former Printify Pop-Up Store are not converted or carried over. The admin quote field stores GBP pence. Product selling prices remain unquoted until confirmed.

## First deployment setup

1. Apply migrations/0001_shop.sql to D1 database ghf-enquiries (database ID is configured through the Cloudflare Pages binding, not stored here).
2. Configure the Pages project with a D1 binding named SHOP_DB for the existing ghf-enquiries database, in both preview and production.
3. Set SHOP_ENV=preview in the preview deployment and SHOP_ENV=production in production. Preview order writes are deliberately disabled.
4. Create two Cloudflare Access self-hosted applications for the canonical paths /shop/admin* and /shop/api/admin*, each with an allow policy for the account owner's verified identity.
5. Set SHOP_ACCESS_AUD to the Access audience tag for the API application and SHOP_ADMIN_EMAIL to the allowed email address in the production Pages environment.
6. Deploy and test the public request flow, Access-protected admin queue, status changes, GBP quotations, and path-proxy asset/API URLs before enabling production requests.

Do not add an API token, payment credential, customer record, bank detail or secret to this repository.
