# Notes for AI coding agents working on Leash

- Next.js 16 (App Router, Turbopack). APIs differ from older versions: read the relevant guide in
  `node_modules/next/dist/docs/` before writing Next.js code. Route params are a Promise.
- Money is integer cents everywhere (`lib/money.ts`). Convert to PayPal decimal strings only in `lib/paypal/`.
- PayPal is sandbox-only (`lib/paypal/client.ts`). Never add a live mode: the hackathon requires the sandbox.
- Every money-moving PayPal call passes a `PayPal-Request-Id` (idempotency).
- The golden rule: only `lib/policy/evaluate.ts` (deterministic) or a person can approve money. The AI
  review and the detectors can only make a decision stricter (`lib/decision/pipeline.ts`). Keep it that way.
- AI calls go through `lib/ai/openrouter.ts` (OpenRouter's OpenAI-compatible chat completions; model from
  `OPENROUTER_MODEL`, default `nvidia/nemotron-3-ultra-550b-a55b:free`). JSON answers are requested in the
  prompt, extracted and validated with zod (free models don't reliably support structured outputs); any
  refusal, truncation or bad JSON throws `AiUnavailableError` — fail closed.
- Run `npm test`, `npm run typecheck` and `npm run lint` before committing.
