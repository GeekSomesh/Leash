# Devpost submission kit

Everything the Devpost form asks for, ready to paste. Fill in the placeholders before submitting.
**Submit by Thu Nov 12, 2026, 18:00 IST** (deadline 12:00 PT / 01:30 IST Fri Nov 13), then test the
submission as a judge would (fresh browser, hosted URL, all four scenes).

## Project name and tagline

- **Name:** Leash
- **Tagline:** Let AI spend. Keep it on a leash.
- **Elevator pitch:** A safety layer for money moved by AI agents, and for the people scams target.
  Agents and voice assistants ask Leash to pay instead of holding PayPal access themselves. Leash checks
  every payment against what the owner actually intended, holds it in PayPal when something looks wrong,
  and lets a trusted person decide. A hidden sentence on a web page and a bail-money phone call are the
  same attack — social engineering — and Leash catches both.

## Links

- Public repo: `https://github.com/GeekSomesh/Leash` (MIT)
- Hosted app: `<RENDER URL>` — Judge Mode is on the home page
- Demo video: `<YOUTUBE LINK>` (under 3:00, no copyrighted music)

## Testing instructions for judges (paste into Devpost)

1. Open `<RENDER URL>`. The console loads with the demo family (Priya, her father Ramesh) and their agents.
2. **Reset demo** (Judge Mode header), then **Hold $150 in PayPal for 7 days** and approve it in the PayPal
   sandbox with the Personal buyer account (use a private browser window if the checkout page stays blank).
3. Run the four scenes. Expected results:
   - **Scene 1, Weekly groceries:** paid — a partial capture from the allowance, then a Payout to the
     merchant. Real PayPal ids appear in the trace (expand "Show why" → PayPal activity).
   - **Scene 2, Maya's birthday gift:** paid — it fits the $40 task.
   - **Scene 3, Poisoned product page:** blocked — the hidden instruction is quoted, nothing captured.
   - **Scene 4, The bail-money call:** held — authorized, not captured, cooling-off countdown. From the
     payment card, open the phone view (`/approve/<id>`) and press **Decline** (declining works any time;
     only approving waits for the countdown): the hold is voided and the trace says the money never moved.
4. Voice scene (recommended): open `/assistant`, type (or speak) "Send two thousand dollars to Arjun, to the
   PayPal he gave me", and keep the "What the caller said" box filled (it is prefilled with the scam call).
   Leash pays the account the caller gave only because the request points at it, then holds it: the trace
   shows "Arjun has been paid before, but at a different account" plus the scam signals. Saying just
   "send two thousand dollars to Arjun" pays the real Arjun's known account instead (still held for
   approval: it's over $200 and the call has scam signs). An unknown payee is never guessed: the assistant asks.
5. Over MCP: the console's **Connect over MCP** dialog has per-agent configs, or run
   `APP_BASE_URL=https://<host> npm run mcp:smoke` from a clone.
6. Insights: `/insights` is an AG Studio report. Click a bar or slice (say, "Gift agent") to filter the rest
   of the page; the second page shows the PayPal ledger. Press **Edit** to see the Leash meter in the
   widget menu and to open the AI panel. There, the Leash analyst (an AI agent) answers questions like "What
   did Leash stop?" and can add a chart. **Tables (AG Grid)** shows the same data as grids.

Sandbox buyer credentials for the approval step: `<BUYER EMAIL / PASSWORD or "use your own sandbox account">`.

## AI tools used (Devpost disclosure)

- **AI via OpenRouter** — `nvidia/nemotron-3-ultra-550b-a55b:free` through `lib/ai/openrouter.ts`
  (OpenAI-compatible chat completions; JSON answers validated against zod schemas):
  - payment review (item categories, task fit, injection, scam) — can only escalate, fails closed;
  - plain explanations (owner, guardian, or the older adult; calm, never shaming);
  - plain-English → policy compiler (with a code-generated read-back of the exact JSON);
  - voice-request parsing on `/assistant` (with a deterministic pattern fallback);
  - the Leash analyst on `/insights`: an AG Studio agent whose turns run on the model through
    `/api/ai/studio` (read-only; it can add charts to the report but never touches money).
- Claude Code assisted with writing code during the submission period.
- Without an `OPENROUTER_API_KEY` Leash still decides: the deterministic rules engine and fixed-pattern
  detectors cover every demo scene (the console says "AI off").

## Sponsor tools used

- **AG Studio** (`ag-studio` / `ag-studio-react` 3.0.0): the `/insights` report.
  - **Data:** five linked data sources (payments, why Leash stopped them, the PayPal ledger, the
    allowance, the agents), joined by relationships so a click on a "why stopped" bar filters the
    payments too.
  - **Report:** a pre-built two-page report: KPIs, spend by agent, decisions, why Leash stopped payments,
    every decision, and PayPal money movements.
  - **Custom widget:** the Leash meter, built on the widget API. It appears in the widget menu and is
    described to the AI.
  - **Theme:** Leash's colours and type through `studioTheme.withParams`.
  - **AI:** the Studio Agent Framework with a custom LLM adapter, so the Leash analyst and AG Studio's
    built-in agents run on the OpenRouter-hosted model on the server.
- **AG Grid Community** (`ag-grid-community` 36.2.0, `ag-grid-react` 36.2.0, MIT): the insights tables
  (decisions, what Leash stopped, PayPal ledger, agents), themed with the Theming API from Leash's design
  tokens.
- **Render**: web service + Postgres via the `render.yaml` Blueprint (paid plans through Dec 15).

## Demo video script (2:50)

- **0:00–0:15 hook:** agents can spend now, and scammers noticed. "$4.9B reported lost by people over 60
  to fraud in 2024 (FBI)." One attack, two victims.
- **0:15–0:35:** Priya's rules in plain English; read-back of the enforced policy; the $150 allowance held
  in PayPal (authorize, not charge).
- **0:35–0:55:** Scene 1 — groceries paid: partial capture from the allowance, Payout to the merchant,
  real sandbox ids in the trace.
- **0:55–1:30:** Scene 3 — the poisoned listing; hidden white-on-white text highlighted and quoted;
  blocked; "nothing has been sent."
- **1:30–2:10:** Scene 4 by voice on `/assistant` — the bail call, held with cooling-off; Priya's phone
  view with the quoted scam lines; Decline; the hold is released.
- **2:10–2:30:** `/insights` on AG Studio: click "Gift agent" to filter the page, point at the Leash meter,
  and ask the Leash analyst "What did Leash stop?"
- **2:30–2:50:** how it's built (rules engine + detectors + escalate-only AI review; MCP server; PayPal
  authorizations, partial captures, voids, payouts, verified webhooks). Close on the tagline.

## Devpost form fields checklist

- [ ] Project description (use the elevator pitch + the four-scene story)
- [ ] Public repo URL + MIT licence visible on the repo page
- [ ] YouTube demo video link
- [ ] Hosted URL + the testing instructions above
- [ ] "Uses PayPal" — sandbox: Orders (authorize), partial captures, voids, Payouts, verified webhooks, MCP
- [ ] "Uses AI" — OpenRouter-hosted AI (Nemotron Ultra 550B): reviews, explanations, compiler, voice parsing
- [ ] Sponsor questions: AG Studio (linked data sources, pre-built report, Leash meter custom widget, theme,
      AI agents through the Studio Agent Framework), AG Grid Community (tables), Render
- [ ] Set `AG_STUDIO` on Render if you have a licence key, so the hosted report has no trial watermark
- [ ] Team and built-during-hackathon attestation (started Nov 1, 2026)
