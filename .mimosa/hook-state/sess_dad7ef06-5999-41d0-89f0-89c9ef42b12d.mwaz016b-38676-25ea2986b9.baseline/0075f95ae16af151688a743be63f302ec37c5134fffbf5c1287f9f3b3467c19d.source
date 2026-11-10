"use client";

import { useEffect, useState } from "react";
import type { Check } from "@/lib/domain/schemas";

export const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-pass-soft text-pass" },
  approved: { label: "Approved", className: "bg-pass-soft text-pass" },
  held: { label: "Held for approval", className: "bg-hold-soft text-hold" },
  awaiting_payer: { label: "Waiting for the payer in PayPal", className: "bg-hold-soft text-hold" },
  blocked: { label: "Blocked", className: "bg-block-soft text-block" },
  declined: { label: "Declined, hold released", className: "bg-info-soft text-info" },
  failed: { label: "Failed", className: "bg-block-soft text-block" },
  refunded: { label: "Refunded", className: "bg-info-soft text-info" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? { label: status, className: "bg-info-soft text-info" };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.className}`}>{style.label}</span>;
}

export function SimulatedBadge() {
  return (
    <span
      title="PayPal sandbox keys aren't configured, so Leash simulated this PayPal step."
      className="inline-flex items-center rounded border border-dashed border-muted px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-muted"
    >
      simulated
    </span>
  );
}

const CHECK_ICON: Record<Check["status"], { symbol: string; className: string; label: string }> = {
  pass: { symbol: "✓", className: "bg-pass-soft text-pass", label: "Passed" },
  hold: { symbol: "‖", className: "bg-hold-soft text-hold", label: "Needs a person" },
  block: { symbol: "✕", className: "bg-block-soft text-block", label: "Blocked" },
  info: { symbol: "i", className: "bg-info-soft text-info", label: "Note" },
  skipped: { symbol: "–", className: "bg-paper text-muted", label: "Not applicable" },
};

export function CheckIcon({ status }: { status: Check["status"] }) {
  const icon = CHECK_ICON[status];
  return (
    <span
      aria-label={icon.label}
      title={icon.label}
      className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${icon.className}`}
    >
      {icon.symbol}
    </span>
  );
}

const SOURCE: Record<Check["source"], { label: string; className: string }> = {
  rule: { label: "Rule", className: "border-ink/20 text-ink-soft" },
  heuristic: { label: "Detector", className: "border-info/30 text-info" },
  ai: { label: "AI", className: "border-brand/30 text-brand" },
};

export function SourceTag({ source }: { source: Check["source"] }) {
  const s = SOURCE[source];
  return <span className={`rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${s.className}`}>{s.label}</span>;
}

/** Live "mm:ss left" until `until`; calls onDone once when it passes. */
export function Countdown({ until, onDone }: { until: string; onDone?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const end = Date.parse(until);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, end - now);
  useEffect(() => {
    if (left === 0) onDone?.();
  }, [left, onDone]);
  if (left === 0) return <span>Cooling-off period is over</span>;
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return (
    <span className="font-mono tabular-nums">
      {minutes}:{seconds.toString().padStart(2, "0")} left
    </span>
  );
}

export function LeashMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <path d="M13 13 C 19 19, 14 24, 22 26" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="20" y="22.5" width="8" height="7" rx="2" fill="currentColor" />
    </svg>
  );
}
