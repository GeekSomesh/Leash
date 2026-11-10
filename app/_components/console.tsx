"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ConsoleState } from "@/lib/console-state";
import { SCENARIO_INFO, type ScenarioName } from "@/lib/demo/scenario-info";
import { formatUsd } from "@/lib/money";
import { LeashMark, SimulatedBadge } from "./bits";
import { PaymentCard } from "./payment-card";

const PAYPAL_BANNERS: Record<string, { text: string; tone: "good" | "bad" }> = {
  "allowance-approved": { text: "Allowance approved in PayPal: the money is held, not charged.", tone: "good" },
  "transfer-approved": { text: "Hold approved in PayPal. Leash decides whether it's captured.", tone: "good" },
  cancelled: { text: "You cancelled in PayPal. Nothing was held.", tone: "bad" },
  error: { text: "Leash couldn't finish the PayPal step. Check the server log.", tone: "bad" },
  "missing-order": { text: "PayPal didn't say which order this was.", tone: "bad" },
};

type CompiledPolicy = { policy: unknown; plainEnglish: string[]; questions: string[] };

type EditingRules = {
  agentId: string;
  agentName: string;
  ownerName: string;
  guardianName: string | null;
  rules: string;
  compiled: CompiledPolicy | null;
};

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data;
}

export function Console() {
  const [state, setState] = useState<ConsoleState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [connect, setConnect] = useState<{ agentName: string; token: string; mcpUrl: string } | null>(null);
  const [editing, setEditing] = useState<EditingRules | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (res.ok) setState((await res.json()) as ConsoleState);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 2500);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const banner = params.get("paypal") && PAYPAL_BANNERS[params.get("paypal")!];
    if (!banner) return;
    window.history.replaceState(null, "", window.location.pathname);
    const show = setTimeout(() => setMessage(banner), 0);
    return () => clearTimeout(show);
  }, []);

  async function act(key: string, run: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await run();
      await refresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), tone: "bad" });
    } finally {
      setBusy(null);
    }
  }

  const runScenario = (name: ScenarioName) => act(`scenario-${name}`, async () => void (await post(`/api/scenarios/${name}`)));
  const resolve = (id: string, decision: "approve" | "decline") => act(`resolve-${id}`, async () => void (await post(`/api/payments/${id}/resolve`, { decision })));
  const refund = (id: string) => act(`refund-${id}`, async () => void (await post(`/api/payments/${id}/refund`)));
  const reset = () => act("reset", async () => void (await post("/api/demo/reset")));
  const holdAllowance = () =>
    act("allowance", async () => {
      const result = (await post("/api/allowances", { amountCents: 15000, days: 7 })) as { approveUrl: string | null };
      if (result.approveUrl) window.location.href = result.approveUrl;
    });
  const releaseAllowance = (id: string) => act(`void-${id}`, async () => void (await post(`/api/allowances/${id}/void`)));
  const connectAgent = (id: string, agentName: string) =>
    act(`token-${id}`, async () => {
      const result = (await post(`/api/agents/${id}/token`)) as { token: string; mcpUrl: string };
      setConnect({ agentName, token: result.token, mcpUrl: result.mcpUrl });
    });

  const editRules = (agent: ConsoleState["agents"][number]) => {
    setCompileError(null);
    setEditing({ agentId: agent.id, agentName: agent.name, ownerName: agent.ownerName, guardianName: agent.guardianName, rules: agent.policySource, compiled: null });
  };

  const compileRules = async () => {
    if (!editing) return;
    setBusy("compile-rules");
    setCompileError(null);
    try {
      const compiled = (await post("/api/policies/compile", {
        rules: editing.rules,
        agentName: editing.agentName,
        ownerName: editing.ownerName,
        guardianName: editing.guardianName,
      })) as CompiledPolicy;
      setEditing({ ...editing, compiled });
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const saveRules = (id: string, compiled: CompiledPolicy, rules: string) =>
    act(`save-rules-${id}`, async () => {
      await post(`/api/agents/${id}/policy`, { policy: compiled.policy, policySource: rules });
      setEditing(null);
    });

  const allowance = state?.allowances.find((a) => a.status === "active") ?? state?.allowances[0];
  const held = state?.payments.filter((p) => p.status === "held") ?? [];

  return (
    <div className="min-h-screen">
      <header className="bg-gradient-to-r from-brand-deep to-[#123d8f] text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <LeashMark />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Leash</h1>
              <p className="text-sm text-white/75">Let AI spend. Keep it on a leash.</p>
            </div>
          </div>
          {state && (
            <div className="flex flex-wrap gap-2 text-xs">
              <ModePill on={state.mode.paypal === "sandbox"} label={state.mode.paypal === "sandbox" ? "PayPal sandbox connected" : "PayPal simulated: add sandbox keys"} />
              <ModePill on={state.mode.ai} label={state.mode.ai ? "AI reviewing via OpenRouter" : "AI off: rules and detectors only"} />
              <ModePill on label={state.mode.database === "postgres" ? "Postgres" : "Embedded Postgres"} />
            </div>
          )}
          <nav aria-label="Leash pages" className="flex w-full gap-1 text-sm font-semibold">
            <Link href="/assistant" className="rounded-lg px-3 py-1.5 text-white/85 hover:bg-white/10 hover:text-white">
              🎙️ Voice assistant
            </Link>
            <Link href="/insights" className="rounded-lg px-3 py-1.5 text-white/85 hover:bg-white/10 hover:text-white">
              📊 Insights
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
        {message && (
          <div role="status" className={`rounded-lg px-4 py-3 text-sm ${message.tone === "good" ? "bg-pass-soft text-pass" : "bg-block-soft text-block"}`}>
            {message.text}
          </div>
        )}

        <section aria-labelledby="judge-mode">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="judge-mode" className="text-lg font-semibold">
                Judge Mode
              </h2>
              <p className="text-sm text-muted">Run each scene. Every payment goes through the same pipeline an agent uses over MCP.</p>
            </div>
            <button type="button" onClick={reset} disabled={busy !== null} className="rounded-lg border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:bg-paper disabled:opacity-50">
              {busy === "reset" ? "Resetting…" : "Reset demo"}
            </button>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SCENARIO_INFO.map((scenario, index) => (
              <li key={scenario.name} className="flex flex-col rounded-xl border border-line bg-card p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Scene {index + 1}</p>
                <h3 className="mt-1 font-semibold">{scenario.title}</h3>
                <p className="mt-1 flex-1 text-sm text-ink-soft">{scenario.summary}</p>
                <p className="mt-2 text-xs text-muted">{scenario.expect}</p>
                <button
                  type="button"
                  onClick={() => runScenario(scenario.name)}
                  disabled={busy !== null}
                  className="mt-3 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
                >
                  {busy === `scenario-${scenario.name}` ? "Deciding…" : "Run"}
                </button>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-8 lg:grid-cols-3">
          <section aria-labelledby="activity" className="space-y-3 lg:col-span-2">
            <h2 id="activity" className="text-lg font-semibold">
              Activity
            </h2>
            {!state && <p className="text-sm text-muted">Loading…</p>}
            {state?.payments.length === 0 && (
              <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Run a scene to see Leash decide.</p>
            )}
            {state?.payments.map((payment) => (
              <PaymentCard key={payment.id} payment={payment} onResolve={resolve} onRefund={refund} busy={busy !== null} />
            ))}
          </section>

          <aside className="space-y-6">
            {held.length > 0 && (
              <section className="rounded-xl border border-hold/40 bg-hold-soft/50 p-4">
                <h2 className="font-semibold text-hold">Needs approval ({held.length})</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {held.map((p) => (
                    <li key={p.id}>
                      {formatUsd(p.totalCents)} to {p.payeeName} <span className="text-muted">· {p.agentName}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-line bg-card p-4 shadow-sm">
              <h2 className="font-semibold">Agent allowance</h2>
              <p className="mt-1 text-sm text-muted">Money held on Priya&apos;s PayPal account. Agents capture from it; whatever&apos;s left is released, never charged.</p>
              {allowance ? (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-semibold tabular-nums">{formatUsd(allowance.amountCents - allowance.capturedCents)}</span>
                    <span className="text-muted">left of {formatUsd(allowance.amountCents)}</span>
                    {allowance.simulated && <SimulatedBadge />}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-paper">
                    <div className="h-full bg-brand" style={{ width: `${Math.min(100, (allowance.capturedCents / allowance.amountCents) * 100)}%` }} />
                  </div>
                  <p className="text-muted">
                    {allowance.status === "active"
                      ? `Held until ${new Date(allowance.periodEnd).toLocaleDateString()}`
                      : allowance.status === "awaiting_approval"
                        ? "Waiting for approval in PayPal"
                        : `Status: ${allowance.status}`}
                  </p>
                  {allowance.simulated && state?.mode.paypal === "sandbox" && (
                    <p className="rounded-lg bg-hold-soft px-3 py-2 text-hold">
                      This allowance was simulated before PayPal was connected. Reset the demo, then hold a real one in the PayPal sandbox.
                    </p>
                  )}
                  {state?.mode.paypal === "sandbox" && !(state.mode.payoutEmails.merchants && state.mode.payoutEmails.people) && (
                    <p className="rounded-lg bg-hold-soft px-3 py-2 text-hold">
                      Sandbox payee emails aren&apos;t set yet, so Payouts will be skipped and logged. Add
                      {" "}<code className="font-mono text-xs">DEMO_MERCHANT_FRESHCART_EMAIL</code>,{" "}
                      <code className="font-mono text-xs">DEMO_MERCHANT_ORBITTOYS_EMAIL</code> and{" "}
                      <code className="font-mono text-xs">DEMO_PERSON_ARJUN_EMAIL</code> to .env.local, then restart.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {allowance.status === "active" && (
                      <button type="button" onClick={() => releaseAllowance(allowance.id)} disabled={busy !== null} className="rounded-lg border border-line px-3 py-1.5 font-semibold hover:bg-paper disabled:opacity-50">
                        Release what&apos;s left
                      </button>
                    )}
                    {allowance.approveUrl && (
                      <a href={allowance.approveUrl} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white">
                        Approve in PayPal
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm">No allowance held yet.</p>
              )}
              {allowance?.status !== "active" && allowance?.status !== "awaiting_approval" && (
                <button type="button" onClick={holdAllowance} disabled={busy !== null} className="mt-3 w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50">
                  Hold $150 in PayPal for 7 days
                </button>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="font-semibold">Agents and their rules</h2>
              {state?.agents.map((agent) => (
                <article key={agent.id} className="rounded-xl border border-line bg-card p-4 text-sm shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{agent.name}</h3>
                      <p className="text-xs text-muted">Works for {agent.ownerName}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => editRules(agent)} disabled={busy !== null} className="rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-paper disabled:opacity-50">
                        Edit rules
                      </button>
                      <button type="button" onClick={() => connectAgent(agent.id, agent.name)} disabled={busy !== null} className="rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-paper disabled:opacity-50">
                        Connect over MCP
                      </button>
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-semibold text-brand">Rules, as Leash enforces them</summary>
                    <blockquote className="mt-2 border-l-2 border-line pl-2 text-xs italic text-muted">{agent.policySource}</blockquote>
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-ink-soft">
                      {agent.rules.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                  </details>
                  {agent.mandates.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {agent.mandates.map((m) => (
                        <li key={m.id} className="text-xs">
                          <p className="text-ink-soft">Task: {m.purpose}</p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
                              <div className="h-full bg-pass" style={{ width: `${Math.min(100, (m.spentCents / m.maxTotalCents) * 100)}%` }} />
                            </div>
                            <span className="tabular-nums text-muted">
                              {formatUsd(m.spentCents)} / {formatUsd(m.maxTotalCents)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </section>
          </aside>
        </div>
      </main>

      {connect && (
        <div role="dialog" aria-modal="true" aria-labelledby="connect-title" className="fixed inset-0 z-10 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-card p-5 shadow-xl">
            <h2 id="connect-title" className="font-semibold">
              Connect {connect.agentName} over MCP
            </h2>
            <p className="mt-1 text-sm text-muted">Add this to any MCP client (Claude, Cursor, your own agent). The token is shown once; the previous one no longer works.</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-paper p-3 text-xs">
              {JSON.stringify({ mcpServers: { leash: { url: connect.mcpUrl, headers: { Authorization: `Bearer ${connect.token}` } } } }, null, 2)}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => void navigator.clipboard?.writeText(connect.token)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper">
                Copy token
              </button>
              <button type="button" onClick={() => setConnect(null)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div role="dialog" aria-modal="true" aria-labelledby="edit-rules-title" className="fixed inset-0 z-10 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-card p-5 shadow-xl">
            <h2 id="edit-rules-title" className="font-semibold">
              Rules for {editing.agentName}, in plain English
            </h2>
            {!state?.mode.ai ? (
              <p className="mt-3 rounded-lg bg-hold-soft px-3 py-2 text-sm text-hold">
                Editing rules needs the AI model, which isn&apos;t set up on this server. Add <code className="font-mono text-xs">OPENROUTER_API_KEY</code> to .env.local and restart.
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">Write the rules the way you would say them. The AI compiles them into the policy Leash enforces, and reads it back before you save.</p>
                <textarea
                  value={editing.rules}
                  onChange={(e) => setEditing({ ...editing, rules: e.target.value, compiled: null })}
                  rows={6}
                  aria-label="Plain-English rules"
                  className="mt-3 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
                />
                {compileError && <p className="mt-2 rounded-lg bg-block-soft px-3 py-2 text-sm text-block">{compileError}</p>}
                {editing.compiled && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">What Leash will enforce</p>
                    <ul className="list-disc space-y-0.5 pl-4 text-sm text-ink-soft">
                      {editing.compiled.plainEnglish.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                    {editing.compiled.questions.length > 0 && (
                      <div className="rounded-lg bg-hold-soft px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-hold">Questions to check</p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-hold">
                          {editing.compiled.questions.map((question) => (
                            <li key={question}>{question}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper">
                    Cancel
                  </button>
                  <button type="button" onClick={() => void compileRules()} disabled={busy !== null || editing.rules.trim().length < 10} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-paper disabled:opacity-50">
                    {busy === "compile-rules" ? "Compiling…" : editing.compiled ? "Compile again" : "Compile with AI"}
                  </button>
                  <button
                    type="button"
                    onClick={() => editing.compiled && saveRules(editing.agentId, editing.compiled, editing.rules)}
                    disabled={busy !== null || !editing.compiled}
                    className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy?.startsWith("save-rules") ? "Saving…" : "Save rules"}
                  </button>
                </div>
              </>
            )}
            {!state?.mode.ai && (
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModePill({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${on ? "bg-white/15" : "bg-white/5 text-white/70"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-300" : "bg-amber-300"}`} />
      {label}
    </span>
  );
}
