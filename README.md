# Manufacturing ERP — Architecture PoC

React/Vite (Cloudflare Pages) → Hono on Cloudflare Workers → Drizzle → Cloudflare D1. One app, one API, one DB, many firms (Carstuff, Amin Enterprise).

## Plan
1. Schema + migrations (Drizzle → D1)  2. Auth (JWT, PBKDF2) + tenant middleware  3. Tenant-scoped CRUD  4. BOM + ledger-based stock + atomic production  5. Small UI  6. Integration tests

## Relationships
```
users ─< memberships >─ organizations
organizations ─< (every table below carries organization_id)
item_categories (parent_id self-ref) ─< items >─ units
vehicle_makes ─< vehicle_models ─< vehicle_variants ─< product_vehicle_applications >─ items(FINISHED_GOOD)
boms >─ items, product_vehicle_applications, units ─< bom_lines >─ items, units
stock_ledger >─ items, units          (append-only; stock = SUM(qty_in - qty_out))
```
Unique `(organization_id, sku)` on items; indexes on `(organization_id, name|created_at|…)`.

## Multi-tenancy
- Login → JWT `{sub, org, exp 1h}`. Multi-org users get `org = null` until `POST /api/organizations/switch` (membership verified) issues a new token.
- `tenant` middleware reads org **only from the signed token** and re-checks an ACTIVE membership on every request.
- Every query filters `organization_id = <token org>`; inserts set it server-side. Zod strips any client `organizationId`; body/query/URL values are ignored. Foreign-key ids from the client (category, unit, item…) are verified to belong to the org (else 422). Cross-tenant ids → 404.

## Layout (condensed for a PoC)
```
src/index.ts          routes (+ generic CRUD)     src/middleware.ts  auth + tenant
src/services/         bom.ts, production.ts       src/db/schema.ts   Drizzle schema
src/seed.ts           dev seed (wipes + reseeds)  src/lib/crypto.ts  PBKDF2
web/src/              api.ts (central client), App.tsx
tests/isolation.test.ts   migrations/ (generated)
```
Repositories are folded into services/routes to keep this small.

## Run locally
```bash
npm install
cp .env.example .dev.vars          # JWT_SECRET + ENABLE_SEED=true
npm run db:generate                # creates migrations/
npm run db:migrate:local           # local D1 (miniflare, no external DB)
npm run dev                        # API on :8787
npm run db:seed                    # in another terminal (wipes + reseeds)
npm run dev:web                    # UI on :5173 (proxies /api)
npm test                           # with the API running
```
Logins: `owner@demo.com` (Carstuff + Amin, OWNER), `staff@demo.com` (Carstuff, STAFF); password `Demo@123`.

## Deploy
```bash
wrangler login
wrangler d1 create manufacturing-erp-db          # paste database_id into wrangler.toml
npm run db:generate && npm run db:migrate:remote
wrangler secret put JWT_SECRET
npm run deploy:api                               # note the *.workers.dev URL
# Frontend (Pages): set ALLOWED_ORIGIN in wrangler.toml to the Pages URL, redeploy API, then:
VITE_API_URL=https://manufacturing-erp-api.<sub>.workers.dev npm run deploy:web
```
(Or connect the repo in the Pages dashboard: build `npm run build`, output `dist`, env `VITE_API_URL`.)
Never set `ENABLE_SEED` in production, so the seed route returns 404. To load demo data remotely, temporarily set it with `wrangler secret put ENABLE_SEED` (value `true`), POST once, then `wrangler secret delete ENABLE_SEED`.

## Test multi-tenancy (manual)
1. Login owner → Carstuff → Items → create "Test Product A". Switch Company → Amin: A is absent. Create "Test Product B"; switch back: B is absent.
2. Two windows (token is per-tab `sessionStorage`): window A = Carstuff, window B = Amin. Create data in A; B never sees it.

## Test production
Production tab → Premium 7D Car Mat → qty 2 → Stock tab shows raw down, finished up. Qty 10 needs 125 SQFT PVC vs 100 in stock → 409, nothing written.

## Notes / limits
- Atomicity: D1 `batch()` is one transaction. Stock is pre-checked first; for hard concurrency safety under simultaneous production runs add a guard statement in the batch (out of PoC scope).
- BOM line unit = item base unit (no unit conversion). Low-stock threshold hard-coded at 20. IndexedDB intentionally skipped.
- Expected cost: Workers Free (100k req/day), D1 Free (5M reads/day, 100k writes/day, 5 GB) and Pages Free → **$0** for this PoC. Workers Paid is $5/month if you outgrow it; check Cloudflare pricing for current numbers.


## Phase 1 — ERP foundation hardening

- RBAC is enforced server-side: OWNER controls master-data mutations; OWNER and STAFF may execute production.
- Audit log records CREATE/UPDATE/DELETE master-data mutations and production creation, scoped by organization.
- Audit log access is OWNER-only and limited to the latest 100 entries.
- Client-provided organization IDs are never trusted; tenant context still comes only from the signed JWT and active membership.
- Phase 1 is intentionally not the full production security layer yet. Refresh-token rotation, password reset, rate limiting/lockout, concurrency-safe stock guards, tenant-aware composite foreign keys, and backup/restore remain later phases.


## CI
GitHub Actions runs Node 22 installation, typecheck, frontend build, local D1 migration, local Worker startup, and the full integration test suite for Phase 1 pull requests.


## Phase 1 CI

Phase 1 validation runs automatically on pushes to feature branches and pull requests targeting `main`.

<!-- Production deployment pipeline enabled -->
