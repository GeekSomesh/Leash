// The AG Studio agent setup: a custom "Leash analyst" is the primary agent. It knows what
// Leash's data means, answers questions with Studio's query tools, and delegates building or
// changing the dashboard to Studio's built-in data, widget, page and planning agents. Every
// agent runs on Claude Opus 5.5 through the Claude adapter.

import { createAiHarness, directLlmRunner, type AgAiHarnessSetup } from "ag-studio";
import { claudeStudioAdapter } from "./claude-adapter";

const INSTRUCTIONS = `You are the Leash analyst inside the Leash insights dashboard.

Leash is a safety layer between AI agents (and voice assistants) and their PayPal money. Agents ask Leash to pay; Leash approves, holds for a person, or blocks each payment, and the money moves in the PayPal sandbox.

The data:
- payments: every payment an agent asked for, with the agent, payee, amount (US dollars), Leash's decision (Approved, Held for a person, Blocked), status, and helper columns: paid (dollars actually paid), stopped (dollars blocked or declined, which never moved), waiting (1 when a person still has to decide).
- stops: each check that held or blocked a payment: the reason, its source (the owner's rules, a built-in detector, or Claude), the result and the detail. Linked to payments by paymentId.
- ledger: money movements in PayPal (hold placed, captured, hold released, paid out, refunded) with PayPal ids. Linked to payments by paymentId.
- allowance: the money held on the owner's PayPal account that agent purchases capture from.
- agents: the agents and who they work for.

How to work:
- Answer in plain English, briefly. Look at the schema and query the data before stating numbers; never guess.
- To add, change or arrange widgets, delegate to the widget or page agent, and say what you asked for.
- "Simulated" rows were made without PayPal keys; say so when it matters.
- You can only read and present data. You cannot approve, move or refund money, and you never change Leash's rules.`;

export const leashAiHarness: AgAiHarnessSetup = ({ api }) =>
  createAiHarness(api, ({ tools, builtIn }) => ({
    agents: [
      directLlmRunner({
        id: "leash-analyst",
        name: "Leash analyst",
        description: "Explains what the agents spent and what Leash stopped, and asks the other agents to build widgets for it.",
        adapter: claudeStudioAdapter,
        instructions: () => INSTRUCTIONS,
        tools: () => [
          tools.studio.viewSchema(),
          tools.studio.viewReport(),
          tools.studio.executeQuery(),
          tools.delegateTo(["widget", "page", "data", "planning"]),
          tools.renameThread(),
        ],
        maxTurns: 30,
      }),
      directLlmRunner({ ...builtIn.data, adapter: claudeStudioAdapter }),
      directLlmRunner({ ...builtIn.widget, adapter: claudeStudioAdapter }),
      directLlmRunner({ ...builtIn.page, adapter: claudeStudioAdapter }),
      directLlmRunner({ ...builtIn.planning, adapter: claudeStudioAdapter }),
    ],
    primary: "leash-analyst",
    models: [{ id: "claude-opus-5-5", label: "Claude Opus 5.5" }],
    promptStarters: [
      { label: "What did Leash stop?", prompt: "What did Leash block or hold, and why? Add a chart of it by reason." },
      { label: "Spend by agent", prompt: "Which agent spent the most, and how much of the allowance is left?" },
      { label: "Scam signals", prompt: "Which payments were held because they looked like scams, and what were the signals?" },
    ],
  }));
