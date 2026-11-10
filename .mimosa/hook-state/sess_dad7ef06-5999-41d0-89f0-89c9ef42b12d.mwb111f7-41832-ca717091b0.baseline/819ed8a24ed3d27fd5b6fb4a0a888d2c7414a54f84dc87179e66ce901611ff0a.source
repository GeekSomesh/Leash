"use client";

// The AG Studio report: Leash's data as linked tables, a pre-built two-page dashboard with
// a custom widget, Leash's theme, and (when Claude is configured) the Leash analyst agent.
// Loaded only in the browser (see insights-view.tsx).

import { AgStudioAiModule, enableStudioDevValidations, type AgStudioMode } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { useMemo, useState } from "react";
import type { InsightsData } from "@/lib/insights-data";
import { leashAiHarness } from "./analyst";
import { buildDataSources, INITIAL_REPORT, leashStudioTheme, leashWidgets, type LeashRegistry } from "./report";

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

export default function StudioReport({ data, licenseKey, aiEnabled }: { data: InsightsData; licenseKey?: string; aiEnabled: boolean }) {
  const [mode, setMode] = useState<AgStudioMode>("view");
  const sources = useMemo(() => buildDataSources(data), [data]);
  const widgets = useMemo(() => leashWidgets(), []);
  const modules = useMemo(() => (aiEnabled ? [AgStudioAiModule] : []), [aiEnabled]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Built with AG Studio: click a bar or slice to cross-filter the page.
          {aiEnabled ? " Ask the Leash analyst (AI) to explain the numbers or add a widget." : " Add OPENROUTER_API_KEY to talk to the Leash analyst."}
        </p>
        <div role="group" aria-label="Report mode" className="flex rounded-lg border border-line bg-card p-0.5 text-sm font-semibold">
          {(["view", "edit"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-md px-3 py-1 ${mode === m ? "bg-brand text-white" : "text-ink-soft hover:bg-paper"}`}
            >
              {m === "view" ? "View" : "Edit"}
            </button>
          ))}
        </div>
      </div>
      <AgStudioProvider modules={modules} licenseKey={licenseKey}>
        <div className="h-[1150px] overflow-hidden rounded-xl border border-line">
          <AgStudio<LeashRegistry>
            style={{ width: "100%", height: "100%" }}
            data={sources}
            initialState={INITIAL_REPORT}
            mode={mode}
            theme={leashStudioTheme}
            widgets={widgets}
            ai={aiEnabled ? leashAiHarness : undefined}
          />
        </div>
      </AgStudioProvider>
    </div>
  );
}
