# Deploying Leash to Render

Leash ships as one Next.js app plus a Postgres database, declared in `render.yaml`.
Deployment needs the Render dashboard, so it's a person's job; this page is the checklist.

## 1. Create the services

1. Render → **New → Blueprint**, pick the repo (`render.yaml` at the root). It creates:
   - web service `leash` (Node 22, `npm ci && npm run build`, start `npm run start`, health check `/api/health`, plan `0.5c-512mb`)
   - Postgres `leash-db` (plan `0.1c-256mb`), wired to the app as `DATABASE_URL` automatically
2. Keep both on **paid plans through Dec 15** (judging runs Dec 1–15): free web services sleep
   when idle and free Postgres expires.

## 2. Set the secrets

In the Render dashboard → the `leash` service → **Environment** (all `sync: false` in the blueprint):

| Variable | Value |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | The sandbox REST app's credentials (developer.paypal.com) |
| `PAYPAL_WEBHOOK_ID` | From the sandbox app's webhook settings, after step 3 |
| `DEMO_MERCHANT_FRESHCART_EMAIL`, `DEMO_MERCHANT_ORBITTOYS_EMAIL`, `DEMO_PERSON_ARJUN_EMAIL` | Sandbox account emails that receive Payouts |
| `ANTHROPIC_API_KEY` | Claude (review, explanations, policy compiler, voice parsing, the insights analyst) |
| `AG_STUDIO` | AG Studio licence key (optional: without it the `/insights` report runs as a trial with a watermark) |

`APP_BASE_URL` does not need to be set: `lib/config.ts` falls back to `RENDER_EXTERNAL_URL`,
which Render provides. `DATABASE_URL` comes from the blueprint.

## 3. Register the webhook

1. developer.paypal.com → the sandbox app → **Add Webhook**:
   `https://<host>/api/paypal/webhooks`
2. Subscribe to: capture, authorization, payout batch and payout-item events.
3. Copy the webhook **ID** into `PAYPAL_WEBHOOK_ID` on Render and redeploy.
4. Verify: trigger a scene, then check `paypal_events` (verified rows) and that the ledger
   status updates when a payout moves from PENDING to SUCCESS.

## 4. Hosted checks

- `https://<host>/api/health` → `{ "ok": true }` (DB ping)
- Judge Mode: run scenes 1–4 on the hosted console; traces should show real PayPal ids (no `SIM-…`)
- MCP from a terminal: `APP_BASE_URL=https://<host> npm run mcp:smoke`
- Voice assistant page: `/assistant`; phone view: `/approve/<payment id>`; insights: `/insights`
- Insights analyst: on `/insights`, press **Edit**, open the AI panel and send "What did Leash stop?".
  A `502` from `/api/ai/studio` means Claude rejected the call: check `ANTHROPIC_API_KEY` and the
  service logs. A `429` means the analyst's rate limit was hit.

## 5. If something breaks

- Cold start on the first request is normal on small plans; the health check keeps Render awake during demos.
- Payouts logged `SKIPPED` mean the `DEMO_*` emails are missing or wrong on Render.
- `DATABASE_SSL=true` is only needed when pointing at an external Postgres; the Render-internal
  `DATABASE_URL` doesn't need it.
