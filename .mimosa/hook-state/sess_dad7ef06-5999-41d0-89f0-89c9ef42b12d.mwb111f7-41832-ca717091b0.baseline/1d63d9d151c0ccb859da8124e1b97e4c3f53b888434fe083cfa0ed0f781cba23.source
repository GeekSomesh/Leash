"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Countdown, LeashMark, StatusBadge } from "@/app/_components/bits";
import type { PaymentView } from "@/lib/console-state";
import { formatUsd } from "@/lib/money";

/** The phone view a guardian opens from a notification: one held payment, the signals, and two buttons. */
export function ApproveView({ id }: { id: string }) {
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coolingDone, setCoolingDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/payments/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 404 ? "This payment doesn't exist (the demo may have been reset)." : "Couldn't load the payment.");
      return;
    }
    const data = (await res.json()) as PaymentView;
    setPayment(data);
    setCoolingDone(!data.coolingOffUntil || Date.parse(data.coolingOffUntil) <= Date.now());
  }, [id]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 3000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  async function resolve(decision: "approve" | "decline") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/payments/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "That didn't work.");
    await load();
    setBusy(false);
  }

  const SIGNAL_ORDER = ["payee_changed", "new_payee", "heuristic_scam", "ai_scam"];
  const signals = (payment?.checks ?? [])
    .filter((c) => SIGNAL_ORDER.includes(c.id) && c.status !== "pass" && c.status !== "skipped")
    .sort((a, b) => SIGNAL_ORDER.indexOf(a.id) - SIGNAL_ORDER.indexOf(b.id));

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-6">
      <header className="mb-5 flex items-center gap-2 text-brand-deep">
        <LeashMark className="h-6 w-6" />
        <span className="font-semibold">Leash</span>
        <Link href="/" className="ml-auto text-sm font-semibold text-brand">
          Console
        </Link>
      </header>

      {error && <p className="mb-4 rounded-lg bg-block-soft px-3 py-2 text-sm text-block">{error}</p>}
      {!payment && !error && <p className="text-sm text-muted">Loading…</p>}

      {payment && (
        <article className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
          <div className={`px-5 py-4 ${payment.hold?.scamSuspected ? "bg-block-soft" : "bg-hold-soft"}`}>
            <p className={`text-sm font-semibold ${payment.hold?.scamSuspected ? "text-block" : "text-hold"}`}>
              {payment.hold?.scamSuspected ? "This looks like a scam" : "Approval needed"}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {payment.ownerName}&apos;s {payment.agentName === `${payment.ownerName}'s voice assistant` ? "voice assistant" : payment.agentName} wants to{" "}
              {payment.kind === "transfer" ? "send" : "pay"}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{formatUsd(payment.totalCents)}</p>
            <p className="text-sm">
              to <strong>{payment.payeeName}</strong>
              {payment.request.payee.paypalEmail && <span className="text-muted"> ({payment.request.payee.paypalEmail})</span>}
            </p>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={payment.status} />
              {payment.status === "held" && payment.coolingOffUntil && !coolingDone && (
                <span className="text-sm text-hold">
                  Cooling off: <Countdown until={payment.coolingOffUntil} onDone={() => setCoolingDone(true)} />
                </span>
              )}
            </div>

            {payment.explanation && <p className="text-sm">{payment.explanation}</p>}

            {signals.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">What Leash noticed</h2>
                <ul className="mt-2 space-y-2">
                  {signals.map((check) => (
                    <li key={check.id} className="text-sm">
                      <p>{check.detail}</p>
                      {check.quotes?.map((quote, index) => (
                        <blockquote key={`${check.id}-${index}`} className="mt-1 border-l-2 border-block/50 pl-2 italic">
                          <span className="quote-mark">&ldquo;{quote}&rdquo;</span>
                        </blockquote>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {payment.status === "held" ? (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => resolve("decline")}
                  className="w-full rounded-xl bg-block px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
                >
                  Decline, then call {payment.ownerName}
                </button>
                <button
                  type="button"
                  disabled={busy || !coolingDone}
                  onClick={() => resolve("approve")}
                  className="w-full rounded-xl border border-line px-4 py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {coolingDone ? "Approve" : "Approve (after the cooling-off period)"}
                </button>
                <p className="text-center text-xs text-muted">Nothing has been sent. Declining releases the hold in PayPal.</p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                {payment.status === "declined" ? "Declined. The hold was released, so the money never left the account." : "This payment no longer needs a decision."}
              </p>
            )}
          </div>
        </article>
      )}
    </main>
  );
}
