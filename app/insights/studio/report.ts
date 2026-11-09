// The AG Studio report for Leash: the data model (five related tables), the registry with
// the custom leash meter widget, the theme from Design.md's tokens, and the pre-built
// report users see on first load (they can switch to edit mode and change it).

import type { AgDataSourcesDefinition, AgDefaultWidgetDefinition, AgFieldDefinition, AgPageLayoutState, AgReportState } from "ag-studio";
import { studioTheme } from "ag-studio";
import { createWidgets, type AgRegistry } from "ag-studio-react";
import type { InsightsData } from "@/lib/insights-data";
import { leashMeterDefinition } from "./leash-meter";

/** Studio's default widgets plus the leash meter. */
export interface LeashRegistry extends AgRegistry {
  widgets: readonly (AgDefaultWidgetDefinition | typeof leashMeterDefinition)[];
}

// --- Theme ----------------------------------------------------------------------------------

export const leashStudioTheme = studioTheme.withParams({
  // Studio's root takes these as its size (600px by default); fill the container instead.
  studioMinWidth: "100%",
  studioMinHeight: "100%",
  accentColor: "#0b5fff",
  foregroundColor: "#10213f",
  textColor: "#10213f",
  subtleTextColor: "#6b7890",
  backgroundColor: "#ffffff",
  borderColor: "#dde3ec",
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  chartPaletteFills1Color: "#0b5fff",
  chartPaletteFills2Color: "#0f8a5f",
  chartPaletteFills3Color: "#b26b00",
  chartPaletteFills4Color: "#c62d3a",
  chartPaletteFills5Color: "#4b5b78",
  chartPaletteFills6Color: "#0a2a66",
  chartPaletteStrokes1Color: "#0b5fff",
  chartPaletteStrokes2Color: "#0f8a5f",
  chartPaletteStrokes3Color: "#b26b00",
  chartPaletteStrokes4Color: "#c62d3a",
  chartPaletteStrokes5Color: "#4b5b78",
  chartPaletteStrokes6Color: "#0a2a66",
});

// --- Widgets --------------------------------------------------------------------------------

export function leashWidgets() {
  const defaults = createWidgets({});
  return createWidgets<LeashRegistry>({
    additionalTypes: [leashMeterDefinition],
    menu: [...defaults.menu, { label: "Leash", widgetIds: ["leash-meter"] }],
  });
}

// --- Data -----------------------------------------------------------------------------------

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

type Field = AgFieldDefinition<LeashRegistry>;
const text = (id: string, name: string, cardinality: Field["cardinality"] = "low"): Field => ({ id, name, format: "textFormat", cardinality });
const money = (id: string, name: string): Field => ({ id, name, format: "currencyFormat", formatOptions: { format: usd } });
const count = (id: string, name: string): Field => ({ id, name, format: "integerFormat" });
const time = (id: string, name: string): Field => ({ id, name, format: "dateTimeFormat" });

const DECISION: Record<string, string> = { approve: "Approved", hold: "Held for a person", block: "Blocked" };
const STATUS: Record<string, string> = {
  paid: "Paid",
  approved: "Approved",
  held: "Waiting for approval",
  awaiting_payer: "Waiting for the payer",
  blocked: "Blocked",
  declined: "Declined",
  failed: "Failed",
  refunded: "Refunded",
};
const SOURCE: Record<string, string> = { rule: "Owner's rules", heuristic: "Built-in detector", ai: "Claude" };
const STEP: Record<string, string> = {
  authorization: "Hold placed",
  capture: "Captured",
  void: "Hold released",
  payout: "Paid out",
  refund: "Refunded",
  reauthorization: "Hold renewed",
};
const AGENT_KIND: Record<string, string> = { shopping: "Shopping agent", voice_assistant: "Voice assistant", external: "External agent" };
const mode = (simulated: boolean) => (simulated ? "Simulated" : "PayPal sandbox");

/** Leash's insights snapshot as five related AG Studio tables. Amounts are in dollars here (display only). */
export function buildDataSources(data: InsightsData): AgDataSourcesDefinition<LeashRegistry> {
  const payments = data.payments.map((p) => {
    const amount = p.totalCents / 100;
    return {
      id: p.id,
      createdAt: new Date(p.createdAt),
      agent: p.agentName,
      owner: p.ownerName,
      kind: p.kind === "purchase" ? "Purchase" : "Transfer",
      payee: p.payeeName,
      amount,
      decision: DECISION[p.outcome] ?? p.outcome,
      status: STATUS[p.status] ?? p.status,
      paid: p.status === "paid" ? amount : 0,
      stopped: p.status === "blocked" || p.status === "declined" ? amount : 0,
      waiting: p.status === "held" || p.status === "awaiting_payer" ? 1 : 0,
      mode: mode(p.simulated),
    };
  });

  const stops = data.checks
    .filter((c) => c.status === "hold" || c.status === "block")
    .map((c) => ({
      id: `${c.paymentId}:${c.id}`,
      paymentId: c.paymentId,
      createdAt: new Date(c.createdAt),
      reason: c.label,
      source: SOURCE[c.source] ?? c.source,
      result: c.status === "block" ? "Blocked" : "Held",
      detail: c.detail,
    }));

  const ledger = data.ledger.map((e) => ({
    id: e.id,
    paymentId: e.paymentId ?? "",
    createdAt: new Date(e.createdAt),
    step: STEP[e.type] ?? e.type,
    amount: e.amountCents / 100,
    paypalStatus: e.status,
    paypalId: e.paypalId ?? "",
    mode: mode(e.simulated),
  }));

  const current = data.allowances.find((a) => a.status === "active") ?? data.allowances[0];
  const allowance = current
    ? [{ id: current.id, held: current.amountCents / 100, captured: current.capturedCents / 100, status: current.status, mode: mode(current.simulated) }]
    : [];

  const agents = data.agents.map((a) => ({ name: a.name, kind: AGENT_KIND[a.kind] ?? a.kind, owner: a.ownerName }));

  return {
    description: "Leash: payments AI agents and voice assistants asked to make, what Leash decided, and the money PayPal moved.",
    sources: [
      {
        id: "payments",
        name: "Payments",
        description: "Every payment an agent asked Leash to make, with Leash's decision and status.",
        data: payments,
        fields: [
          text("id", "Payment", "high"),
          time("createdAt", "Time"),
          text("agent", "Agent"),
          text("owner", "Owner"),
          text("kind", "Kind"),
          text("payee", "Payee", "medium"),
          money("amount", "Amount"),
          text("decision", "Decision"),
          text("status", "Status"),
          money("paid", "Paid"),
          money("stopped", "Stopped before it moved"),
          count("waiting", "Waiting for a person"),
          text("mode", "PayPal mode"),
        ],
      },
      {
        id: "stops",
        name: "Why Leash stopped payments",
        description: "Each check that held or blocked a payment: which rule, detector or Claude check, and why.",
        data: stops,
        fields: [
          text("id", "Check", "high"),
          text("paymentId", "Payment", "high"),
          time("createdAt", "Time"),
          text("reason", "Reason", "medium"),
          text("source", "Source"),
          text("result", "Result"),
          text("detail", "Detail", "high"),
        ],
      },
      {
        id: "ledger",
        name: "PayPal activity",
        description: "Money movements in PayPal: holds, captures, releases, payouts and refunds.",
        data: ledger,
        fields: [
          text("id", "Entry", "high"),
          text("paymentId", "Payment", "high"),
          time("createdAt", "Time"),
          text("step", "Step"),
          money("amount", "Amount"),
          text("paypalStatus", "PayPal status"),
          text("paypalId", "PayPal id", "high"),
          text("mode", "PayPal mode"),
        ],
      },
      {
        id: "allowance",
        name: "Allowance",
        description: "The current allowance: money held on the owner's PayPal account that agent purchases capture from.",
        data: allowance,
        fields: [text("id", "Allowance", "high"), money("held", "Held"), money("captured", "Captured"), text("status", "Status"), text("mode", "PayPal mode")],
      },
      {
        id: "agents",
        name: "Agents",
        description: "The AI agents and voice assistants that pay through Leash.",
        data: agents,
        fields: [text("name", "Agent"), text("kind", "Kind"), text("owner", "Owner")],
      },
    ],
    relationships: [
      { id: "stops-payment", source: { tableId: "stops", fieldId: "paymentId" }, target: { tableId: "payments", fieldId: "id" }, type: "many-to-one" },
      { id: "ledger-payment", source: { tableId: "ledger", fieldId: "paymentId" }, target: { tableId: "payments", fieldId: "id" }, type: "many-to-one" },
      { id: "payment-agent", source: { tableId: "payments", fieldId: "agent" }, target: { tableId: "agents", fieldId: "name" }, type: "many-to-one" },
    ],
  };
}

// --- The pre-built report ---------------------------------------------------------------------

const LAYOUT: Partial<AgPageLayoutState> = {
  columns: 24,
  rowHeight: 20,
  backgroundColor: "#f5f7fb",
  widgetBackgroundColor: "#ffffff",
  widgetBorderEnabled: true,
  widgetBorderColor: "#dde3ec",
  widgetBorderRadius: 12,
  widgetPadding: 12,
};

const title = (text: string) => ({ title: { enabled: true, text } });
const kpi = (text: string, subtitle: string) => ({ title: { enabled: true, text }, subtitle: { enabled: true, text: subtitle } });

export const INITIAL_REPORT: AgReportState<LeashRegistry> = {
  selectedPageId: "overview",
  panels: { filters: { collapsed: true } },
  pages: [
    {
      id: "overview",
      layout: LAYOUT,
      widgets: {
        heading: {
          type: "text",
          dataMapping: {},
          format: {
            style: {
              text: "What Leash did with your agents' money. Click any bar or slice to filter the rest of the page.",
              typography: { fontSize: 16 },
              verticalAlign: "center",
            },
          },
        },
        paid: { type: "value", dataMapping: { value: [{ id: "payments.paid", aggregation: "sum" }] }, format: kpi("Paid", "sent to payees") },
        stopped: { type: "value", dataMapping: { value: [{ id: "payments.stopped", aggregation: "sum" }] }, format: kpi("Stopped", "never moved") },
        waiting: { type: "value", dataMapping: { value: [{ id: "payments.waiting", aggregation: "sum" }] }, format: kpi("Waiting", "for a person") },
        decisions: { type: "value", dataMapping: { value: [{ id: "payments.id", aggregation: "countd" }] }, format: kpi("Decisions", "payments checked") },
        meter: {
          type: "leash-meter",
          dataMapping: { used: [{ id: "allowance.captured", aggregation: "sum" }], total: [{ id: "allowance.held", aggregation: "sum" }] },
          format: title("Leash meter"),
        },
        spendByAgent: {
          type: "column-chart-grouped",
          dataMapping: { categoryKey: [{ id: "payments.agent" }], valueKey: [{ id: "payments.paid", aggregation: "sum" }] },
          format: title("Spend by agent"),
        },
        byDecision: {
          type: "donut-chart",
          dataMapping: { categoryKey: [{ id: "payments.decision" }], valueKey: [{ id: "payments.id", aggregation: "countd" }] },
          format: title("Decisions"),
        },
        whyStopped: {
          type: "bar-chart-stacked",
          dataMapping: {
            categoryKey: [{ id: "stops.reason" }],
            valueKey: [{ id: "stops.paymentId", aggregation: "countd" }],
            legendKey: [{ id: "stops.source" }],
          },
          format: title("Why Leash stopped payments"),
        },
        decisionsGrid: {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "payments.createdAt" },
              { id: "payments.agent" },
              { id: "payments.payee" },
              { id: "payments.amount" },
              { id: "payments.decision" },
              { id: "payments.status" },
              { id: "payments.mode" },
            ],
          },
          format: title("Every decision"),
        },
      },
      widgetLayout: {
        heading: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 3 },
        paid: { xTrack: 0, yTrack: 3, xSpan: 6, ySpan: 6 },
        stopped: { xTrack: 6, yTrack: 3, xSpan: 6, ySpan: 6 },
        waiting: { xTrack: 12, yTrack: 3, xSpan: 6, ySpan: 6 },
        decisions: { xTrack: 18, yTrack: 3, xSpan: 6, ySpan: 6 },
        spendByAgent: { xTrack: 0, yTrack: 9, xSpan: 9, ySpan: 14 },
        byDecision: { xTrack: 9, yTrack: 9, xSpan: 8, ySpan: 14 },
        meter: { xTrack: 17, yTrack: 9, xSpan: 7, ySpan: 14 },
        whyStopped: { xTrack: 0, yTrack: 23, xSpan: 24, ySpan: 14 },
        decisionsGrid: { xTrack: 0, yTrack: 37, xSpan: 24, ySpan: 16 },
      },
    },
    {
      id: "paypal",
      layout: LAYOUT,
      widgets: {
        movedByStep: {
          type: "column-chart-grouped",
          dataMapping: { categoryKey: [{ id: "ledger.step" }], valueKey: [{ id: "ledger.amount", aggregation: "sum" }], legendKey: [{ id: "ledger.mode" }] },
          format: title("Money movements in PayPal"),
        },
        ledgerGrid: {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "ledger.createdAt" },
              { id: "ledger.step" },
              { id: "ledger.amount" },
              { id: "ledger.paypalStatus" },
              { id: "ledger.paypalId" },
              { id: "ledger.mode" },
            ],
          },
          format: title("PayPal ledger"),
        },
      },
      widgetLayout: {
        movedByStep: { xTrack: 0, yTrack: 0, xSpan: 24, ySpan: 14 },
        ledgerGrid: { xTrack: 0, yTrack: 14, xSpan: 24, ySpan: 18 },
      },
    },
  ],
};
