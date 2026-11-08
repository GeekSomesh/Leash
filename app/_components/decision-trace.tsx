"use client";

import type { LedgerView } from "@/lib/console-state";
import type { Check } from "@/lib/domain/schemas";
import { formatUsd } from "@/lib/money";
import { CheckIcon, SimulatedBadge, SourceTag } from "./bits";

const GROUPS: { source: Check["source"]; title: string; note: string }[] = [
  { source: "rule", title: "Owner's rules", note: "Deterministic code. The only checks that can approve money." },
  { source: "heuristic", title: "Built-in detectors", note: "Fixed patterns for hidden instructions and scam language. No model needed." },
  { source: "ai", title: "Claude's review", note: "Can only make the decision stricter, never looser." },
];

export function DecisionTrace({ checks }: { checks: Check[] }) {
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        const items = checks.filter((c) => c.source === group.source);
        if (items.length === 0) return null;
        return (
          <section key={group.source}>
            <div className="mb-1.5 flex items-baseline gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{group.title}</h4>
              <span className="text-xs text-muted">{group.note}</span>
            </div>
            <ul className="space-y-1.5">
              {items.map((check) => (
                <li key={check.id} className="flex gap-2.5">
                  <CheckIcon status={check.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{check.label}</span>
                      <SourceTag source={check.source} />
                    </div>
                    <p className={`text-sm ${check.status === "skipped" ? "text-muted" : "text-ink-soft"}`}>{check.detail}</p>
                    {check.quotes?.map((quote) => (
                      <blockquote key={quote} className="mt-1 border-l-2 border-block/50 pl-2 text-sm italic text-ink">
                        <span className="quote-mark">&ldquo;{quote}&rdquo;</span>
                      </blockquote>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const LEDGER_LABEL: Record<string, string> = {
  authorization: "Hold placed",
  capture: "Captured",
  void: "Hold released",
  payout: "Paid out",
  refund: "Refunded",
  reauthorization: "Hold renewed",
};

export function LedgerList({ entries }: { entries: LedgerView[] }) {
  if (entries.length === 0) return <p className="text-sm text-muted">No money moved in PayPal.</p>;
  return (
    <ul className="space-y-1">
      {entries.map((e, i) => (
        <li key={`${e.type}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="font-medium">{LEDGER_LABEL[e.type] ?? e.type}</span>
          <span className="tabular-nums">{formatUsd(e.amountCents)}</span>
          {e.paypalId && <code className="rounded bg-paper px-1 text-xs text-ink-soft">{e.paypalId}</code>}
          <span className="text-xs text-muted">{e.status}</span>
          {e.simulated && <SimulatedBadge />}
          {e.detail && <span className="w-full text-xs text-muted sm:w-auto">{e.detail}</span>}
        </li>
      ))}
    </ul>
  );
}
