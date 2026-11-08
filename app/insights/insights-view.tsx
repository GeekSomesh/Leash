"use client";

// The insights dashboard: what the agents spent, what Leash stopped, and how the PayPal
// allowance is being used. Themed from Design.md's tokens (AG Grid theming API), with a
// custom "leash meter" gauge widget. The same data feeds an AG Studio report when an
// AG_STUDIO licence is configured.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { themeQuartz, type ColDef } from "ag-grid-community";
import { LeashMark } from "@/app/_components/bits";
import type { InsightsCheck, InsightsData, InsightsLedger, InsightsPayment } from "@/lib/insights-data";
import { formatUsd } from "@/lib/money";

const THEME = themeQuartz.withParams({
  accentColor: "#0b5fff",
  foregroundColor: "#10213f",
  backgroundColor: "#ffffff",
  borderColor: "#dde3ec",
  headerBackgroundColor: "#f5f7fb",
  headerTextColor: "#3c4a63",
  oddRowBackgroundColor: "#f5f7fb",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontSize: 11.5,
  wrapperBorder: true,
  wrapperBorderRadius: 12,
  spacing: 6,
});

const DEFAULT_COL: ColDef = { sortable: true, filter: true, resizable: true };
const usd: ColDef["valueFormatter"] = (p) => (typeof p.value === "number" ? formatUsd(p.value) : "");
const when: ColDef["valueFormatter"] = (p) => (p.value ? new Date(p.value as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

const PAYMENT_COLS: ColDef<InsightsPayment>[] = [
  { field: "createdAt", headerName: "Time", valueFormatter: when, flex: 1 },
  { field: "agentName", headerName: "Agent", flex: 1.2 },
  { field: "kind", headerName: "Kind", flex: 0.8 },
  { field: "payeeName", headerName: "Payee", flex: 1.2 },
  { field: "totalCents", headerName: "Amount", valueFormatter: usd, flex: 0.9, type: "rightAligned" },
  { field: "outcome", headerName: "Decision", flex: 0.9 },
  { field: "status", headerName: "Status", flex: 0.9 },
  { field: "simulated", headerName: "Simulated", flex: 0.8 },
];

const STOPPED_COLS: ColDef<InsightsCheck>[] = [
  { field: "createdAt", headerName: "Time", valueFormatter: when, flex: 1 },
  { field: "agentName", headerName: "Agent", flex: 1.1 },
  { field: "payeeName", headerName: "Payee", flex: 1.1 },
  { field: "totalCents", headerName: "Amount", valueFormatter: usd, flex: 0.9, type: "rightAligned" },
  { field: "source", headerName: "Source", flex: 0.8 },
  { field: "label", headerName: "Check", flex: 1.2 },
  { field: "status", headerName: "Result", flex: 0.8 },
  { field: "detail", headerName: "Why", flex: 2.5, tooltipField: "detail" },
];

const LEDGER_COLS: ColDef<InsightsLedger>[] = [
  { field: "createdAt", headerName: "Time", valueFormatter: when, flex: 1 },
  { field: "type", headerName: "Type", flex: 1 },
  { field: "amountCents", headerName: "Amount", valueFormatter: usd, flex: 1, type: "rightAligned" },
  { field: "status", headerName: "Status", flex: 1 },
  { field: "paypalId", headerName: "PayPal id", flex: 1.4, cellClass: "font-mono text-xs" },
  { field: "simulated", headerName: "Simulated", flex: 0.9 },
];

const AGENT_COLS: ColDef<InsightsData["agents"][number]>[] = [
  { field: "name", headerName: "Agent", flex: 1.3 },
  { field: "kind", headerName: "Kind", flex: 1 },
  { field: "ownerName", headerName: "Owner", flex: 1 },
  { field: "paidCents", headerName: "Paid", valueFormatter: usd, flex: 1, type: "rightAligned" },
  { field: "paymentCount", headerName: "Payments", flex: 0.9, type: "rightAligned" },
];

export function InsightsView() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/insights", { cache: "no-store" });
      if (!res.ok) throw new Error(`Couldn't load insights (${res.status}).`);
      setData((await res.json()) as InsightsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  const stopped = useMemo(() => data?.checks.filter((c) => c.status === "hold" || c.status === "block") ?? [], [data]);
  const kpis = useMemo(() => {
    const paid = (data?.payments ?? []).filter((p) => p.status === "paid");
    const blocked = (data?.payments ?? []).filter((p) => p.status === "blocked");
    const held = (data?.payments ?? []).filter((p) => p.status === "held" || p.status === "awaiting_payer");
    const payout = (data?.ledger ?? []).filter((e) => e.type === "payout" && e.status !== "SKIPPED");
    return {
      paidCount: paid.length,
      paidCents: paid.reduce((sum, p) => sum + p.totalCents, 0),
      blockedCount: blocked.length,
      blockedCents: blocked.reduce((sum, p) => sum + p.totalCents, 0),
      heldCount: held.length,
      payoutCents: payout.reduce((sum, e) => sum + e.amountCents, 0),
    };
  }, [data]);
  const activeAllowance = data?.allowances.find((a) => a.status === "active") ?? data?.allowances[0];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 text-brand-deep">
          <LeashMark className="h-6 w-6" />
          <span className="font-semibold">Leash</span>
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Insights</h1>
          <p className="text-sm text-muted">What the agents spent, what Leash stopped, and how the allowance is used.</p>
        </div>
        <button type="button" onClick={() => void load()} className="ml-auto rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:bg-paper">
          Refresh
        </button>
      </header>

      {error && <p className="mb-4 rounded-lg bg-block-soft px-4 py-3 text-sm text-block">{error}</p>}
      {!data && !error && <p className="text-sm text-muted">Loading…</p>}

      {data && (
        <div className="space-y-8">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Paid" value={`${kpis.paidCount} payments`} sub={formatUsd(kpis.paidCents)} tone="pass" />
            <Kpi label="Blocked" value={`${kpis.blockedCount} payments`} sub={`${formatUsd(kpis.blockedCents)} never moved`} tone="block" />
            <Kpi label="Waiting for a person" value={`${kpis.heldCount} payments`} sub="held or in PayPal" tone="hold" />
            <Kpi label="Paid out to payees" value={formatUsd(kpis.payoutCents)} sub="through PayPal Payouts" tone="brand" />
            <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Leash meter</p>
              <div className="mt-1 flex justify-center">
                <LeashMeter used={activeAllowance?.capturedCents ?? 0} total={activeAllowance?.amountCents ?? 0} />
              </div>
              {activeAllowance && <p className="text-center text-xs text-muted">{formatUsd(activeAllowance.amountCents - activeAllowance.capturedCents)} left {activeAllowance.simulated && "· simulated"}</p>}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Spend by agent</h2>
            <Grid columnDefs={AGENT_COLS} rowData={data.agents} />
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">
              What Leash stopped <span className="text-sm font-normal text-muted">({stopped.length} checks held or blocked a payment)</span>
            </h2>
            {stopped.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing held or blocked yet. Run the Judge Mode scenes.</p>
            ) : (
              <Grid columnDefs={STOPPED_COLS} rowData={stopped} />
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Decisions</h2>
            {data.payments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No payments yet.</p>
            ) : (
              <Grid columnDefs={PAYMENT_COLS} rowData={data.payments} />
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">PayPal activity</h2>
            <Grid columnDefs={LEDGER_COLS} rowData={data.ledger} />
          </section>
        </div>
      )}
    </main>
  );
}

function Grid({ columnDefs, rowData }: { columnDefs: ColDef[]; rowData: unknown[] }) {
  return (
    <div className="h-72">
      <AgGridReact theme={THEME} columnDefs={columnDefs} rowData={rowData} defaultColDef={DEFAULT_COL} suppressCellFocus pagination paginationPageSize={20} />
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "pass" | "block" | "hold" | "brand" }) {
  const toneClass = { pass: "text-pass", block: "text-block", hold: "text-hold", brand: "text-brand" }[tone];
  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

/** A half-circle gauge of how much of the allowance the agents have captured. */
function LeashMeter({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(1, used / total) : 0;
  const color = pct > 0.9 ? "var(--color-block)" : pct > 0.6 ? "var(--color-hold)" : "var(--color-pass)";
  return (
    <svg viewBox="0 0 140 82" className="w-full max-w-[200px]" role="img" aria-label={`${Math.round(pct * 100)} percent of the allowance used`}>
      <path d="M 14 70 A 56 56 0 0 1 126 70" fill="none" stroke="var(--color-line)" strokeWidth="12" strokeLinecap="round" />
      <path
        d="M 14 70 A 56 56 0 0 1 126 70"
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${pct * 100} 100`}
      />
      <text x="70" y="62" textAnchor="middle" fill="var(--color-ink)" fontSize="20" fontWeight="600">
        {Math.round(pct * 100)}%
      </text>
      <text x="70" y="78" textAnchor="middle" fill="var(--color-muted)" fontSize="9">
        of the allowance used
      </text>
    </svg>
  );
}
