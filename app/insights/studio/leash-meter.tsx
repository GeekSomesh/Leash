"use client";

// A custom AG Studio widget: the "leash meter", a gauge of how much of the PayPal allowance
// the agents have captured. It reads its two numbers through Studio's data engine, so page
// filters and cross-filters apply to it like any built-in widget, and it shows up in the
// widget menu and to Studio's AI agents.

import type { AgWidgetData, AgWidgetDataFormat, AgWidgetField, AgWidgetFieldReference, AgWidgetParams } from "ag-studio";
import type { AgWidgetDefinition } from "ag-studio-react";
import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/money";

export type LeashMeterDataMapping = { used: AgWidgetFieldReference[]; total: AgWidgetFieldReference[] };

export interface LeashMeterState extends AgWidgetData<LeashMeterDataMapping, AgWidgetDataFormat<Record<string, never>>> {
  type: "leash-meter";
}

/** Reads one aggregated value from a result row, whatever key the engine used for it. */
function valueOf(row: Record<string, unknown>, field: AgWidgetField): number {
  const value = row[field.key] ?? row[field.fieldId];
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function LeashMeterWidget(params: AgWidgetParams<LeashMeterState>) {
  const { widgetApi, dataMapping } = params;
  const usedField = dataMapping.used?.[0];
  const totalField = dataMapping.total?.[0];
  const [values, setValues] = useState<{ used: number; total: number } | null>(null);

  useEffect(() => {
    if (!usedField || !totalField) {
      widgetApi.setDisplayState("incompleteDataMapping");
      return;
    }
    let cancelled = false;
    widgetApi.setDisplayState("loading");
    widgetApi
      .getData({ fields: [usedField, totalField] })
      .then((response) => {
        if (cancelled) return;
        const row = response.results.rows[0];
        if (!row) {
          widgetApi.setDisplayState("noData");
          return;
        }
        setValues({ used: valueOf(row, usedField), total: valueOf(row, totalField) });
        widgetApi.setDisplayState("displayed");
      })
      .catch(() => {
        if (!cancelled) widgetApi.setDisplayState("noData");
      });
    return () => {
      cancelled = true;
    };
    // `params` changes whenever Studio re-renders the widget (new data, filters or mapping).
  }, [widgetApi, usedField, totalField, params]);

  if (!values) return null;
  const pct = values.total > 0 ? Math.min(1, values.used / values.total) : 0;
  const color = pct > 0.9 ? "var(--color-block)" : pct > 0.6 ? "var(--color-hold)" : "var(--color-pass)";
  const left = Math.max(0, values.total - values.used);

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <svg viewBox="0 0 140 82" style={{ width: "100%", maxWidth: 220 }} role="img" aria-label={`${Math.round(pct * 100)} percent of the allowance used`}>
        <path d="M 14 70 A 56 56 0 0 1 126 70" fill="none" stroke="var(--color-line)" strokeWidth="12" strokeLinecap="round" />
        <path d="M 14 70 A 56 56 0 0 1 126 70" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" pathLength={100} strokeDasharray={`${pct * 100} 100`} />
        <text x="70" y="62" textAnchor="middle" fill="var(--color-ink)" fontSize="20" fontWeight="600">
          {Math.round(pct * 100)}%
        </text>
        <text x="70" y="78" textAnchor="middle" fill="var(--color-muted)" fontSize="9">
          of the allowance used
        </text>
      </svg>
      <p style={{ margin: 0, fontSize: 12, color: "var(--color-muted)" }}>
        {formatUsd(Math.round(left * 100))} left of {formatUsd(Math.round(values.total * 100))} held in PayPal
      </p>
    </div>
  );
}

const ICON = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M5 24a11 11 0 0 1 22 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M16 24 22 14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;

export const leashMeterDefinition: AgWidgetDefinition<"leash-meter", LeashMeterState> = {
  id: "leash-meter",
  label: "Leash meter",
  icon: ICON,
  dataMapping: {
    used: { type: "field", supportedRoles: ["numeric"], required: true, intent: "value", aiDescription: "Dollars captured from the PayPal allowance" },
    total: { type: "field", supportedRoles: ["numeric"], required: true, intent: "value", aiDescription: "Dollars held in PayPal for the agents" },
  },
  form: (form) =>
    form.createDefaults({
      dataMappingItems: [
        { key: "used", label: "Used" },
        { key: "total", label: "Held" },
      ],
    }),
  comp: LeashMeterWidget,
  defaultSize: { width: 8, height: 8 },
  minSize: { width: 4, height: 6 },
  ai: {
    label: "Leash meter",
    description: "A gauge of how much of the PayPal allowance the agents have used.",
    usage: "Use it to show allowance usage: map the captured dollars to Used and the held dollars to Held.",
  },
};
