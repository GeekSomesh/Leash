"use client";

import Link from "next/link";
import { useState } from "react";
import type { PaymentView } from "@/lib/console-state";
import { formatUsd } from "@/lib/money";
import { Countdown, SimulatedBadge, StatusBadge } from "./bits";
import { DecisionTrace, LedgerList } from "./decision-trace";

const AGENT_ICON: Record<string, string> = { shopping: "🛒", voice_assistant: "🎙️", external: "🤖" };

export function PaymentCard({
  payment,
  onResolve,
  busy,
}: {
  payment: PaymentView;
  onResolve: (id: string, decision: "approve" | "decline") => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(payment.status === "blocked" || payment.status === "held");
  const [coolingDone, setCoolingDone] = useState(() => !payment.coolingOffUntil || Date.parse(payment.coolingOffUntil) <= Date.now());
  const held = payment.status === "held";
  const accent =
    payment.status === "blocked" || payment.status === "failed"
      ? "border-l-block"
      : held || payment.status === "awaiting_payer"
        ? "border-l-hold"
        : payment.status === "paid" || payment.status === "approved"
          ? "border-l-pass"
          : "border-l-line";

  return (
    <article className={`rounded-xl border border-line border-l-4 ${accent} bg-card p-4 shadow-sm`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            <span aria-hidden="true">{AGENT_ICON[payment.agentKind] ?? "🤖"}</span> {payment.agentName} · {new Date(payment.createdAt).toLocaleTimeString()}
          </p>
          <h3 className="mt-0.5 text-base font-semibold">
            {payment.kind === "transfer" ? "Send money to " : "Buy from "}
            {payment.payeeName}
          </h3>
          <p className="text-sm text-ink-soft">
            {payment.kind === "purchase"
              ? payment.request.items.map((item) => `${item.quantity > 1 ? `${item.quantity}× ` : ""}${item.name}`).join(", ")
              : payment.request.payee.paypalEmail}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="text-xl font-semibold tabular-nums">{formatUsd(payment.totalCents)}</span>
          <div className="flex items-center gap-1.5">
            {payment.simulated && <SimulatedBadge />}
            <StatusBadge status={payment.status} />
          </div>
        </div>
      </header>

      {payment.explanation && <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm">{payment.explanation}</p>}
      {payment.failure && <p className="mt-2 text-sm text-block">{payment.failure}</p>}

      {payment.status === "awaiting_payer" && payment.approveUrl && (
        <p className="mt-3 text-sm">
          The payer needs to approve the hold in PayPal first.{" "}
          <a className="font-semibold text-brand underline" href={payment.approveUrl}>
            Open PayPal
          </a>
        </p>
      )}

      {held && (
        <div className="mt-3 rounded-lg border border-hold/30 bg-hold-soft/60 p-3">
          <p className="text-sm font-semibold text-hold">
            {payment.hold?.scamSuspected ? "Paused: this has the signs of a scam." : "Waiting for approval."} Nothing has been sent.
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Approver: {payment.approvers.map((a) => a.name).join(" and ") || "the owner"}
            {payment.coolingOffUntil && !coolingDone && (
              <>
                {" "}· Cooling off: <Countdown until={payment.coolingOffUntil} onDone={() => setCoolingDone(true)} />
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onResolve(payment.id, "decline")}
              className="rounded-lg bg-block px-3 py-1.5 text-sm font-semibold text-white hover:bg-block/90 disabled:opacity-50"
            >
              Decline and release the hold
            </button>
            <button
              type="button"
              disabled={busy || !coolingDone}
              onClick={() => onResolve(payment.id, "approve")}
              title={coolingDone ? undefined : "A suspected scam can't be approved until the cooling-off period ends."}
              className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve
            </button>
            <Link href={`/approve/${payment.id}`} className="self-center text-sm font-semibold text-brand underline">
              Open the phone view
            </Link>
          </div>
        </div>
      )}

      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 text-sm font-semibold text-brand" aria-expanded={open}>
        {open ? "Hide" : "Show"} why ({payment.checks.length} checks)
      </button>
      {open && (
        <div className="mt-3 space-y-4 border-t border-line pt-3">
          <DecisionTrace checks={payment.checks} />
          <section>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">PayPal</h4>
            <LedgerList entries={payment.ledger} />
          </section>
        </div>
      )}
    </article>
  );
}
