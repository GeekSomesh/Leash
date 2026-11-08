# Notes for AI coding agents working on Leash

- Next.js 16 (App Router, Turbopack). APIs differ from older versions: read the relevant guide in
  `node_modules/next/dist/docs/` before writing Next.js code. Route params are a Promise.
- Money is integer cents everywhere (`lib/money.ts`). Convert to PayPal decimal strings only in `lib/paypal/`.
- PayPal is sandbox-only (`lib/paypal/client.ts`). Never add a live mode: the hackathon requires the sandbox.
- Every money-moving PayPal call passes a `PayPal-Request-Id` (idempotency).
- The golden rule: only `lib/policy/evaluate.ts` (deterministic) or a person can approve money. Claude's
  review and the detectors can only make a decision stricter (`lib/decision/pipeline.ts`). Keep it that way.
- Claude calls go through `lib/ai/claude.ts` (Opus 5.5, explicit effort, refusal fallbacks, structured outputs).
  Don't send `temperature`/`top_p`/`top_k` (rejected by API version 2026-10-21).
- Run `npm test`, `npm run typecheck` and `npm run lint` before committing.
