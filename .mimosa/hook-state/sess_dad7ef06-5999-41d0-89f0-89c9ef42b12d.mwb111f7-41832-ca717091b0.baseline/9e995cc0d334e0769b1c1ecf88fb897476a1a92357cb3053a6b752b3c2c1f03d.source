"use client";

// The voice assistant page Ramesh uses: one big button, plain words, and a calm answer.
// Built for an older adult (Design.md §6): large text, high contrast, no jargon.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LeashMark, StatusBadge } from "@/app/_components/bits";
import type { PaymentView } from "@/lib/console-state";
import { formatUsd } from "@/lib/money";

type Phase = "idle" | "listening" | "thinking" | "result";

/** The slice of the Web Speech API Leash uses. */
type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => RecognitionLike;

function speechRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}

const RESULT_STYLE: Record<string, string> = {
  paid: "bg-pass-soft",
  approved: "bg-pass-soft",
  held: "bg-hold-soft",
  awaiting_payer: "bg-hold-soft",
  blocked: "bg-block-soft",
  failed: "bg-block-soft",
  declined: "bg-info-soft",
};

export function AssistantView({ callerTranscript }: { callerTranscript: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [callerNote, setCallerNote] = useState(callerTranscript);
  // The server can't know whether the browser has speech recognition, so the typing box starts
  // closed (matching the server's HTML) and opens after mount when the browser can't listen.
  const [showTyping, setShowTyping] = useState(false);
  useEffect(() => {
    const check = setTimeout(() => {
      if (!speechRecognition()) setShowTyping(true);
    }, 0);
    return () => clearTimeout(check);
  }, []);
  const recognition = useRef<RecognitionLike | null>(null);

  useEffect(() => () => recognition.current?.abort(), []);

  const submit = useCallback(async (text: string) => {
    const request = text.trim();
    if (request.length < 2) return;
    setPhase("thinking");
    setError(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: request, callerNote: callerNote.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<PaymentView> & { error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "That didn't work. Please try again.");
      setResult(data as PaymentView);
      setPhase("result");
      if (data.explanation) speak(data.explanation);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }, [callerNote]);

  const listen = useCallback(() => {
    const Ctor = speechRecognition();
    if (!Ctor) {
      setShowTyping(true);
      setError("This browser can't listen. Please type your request below.");
      return;
    }
    setError(null);
    recognition.current?.abort();
    const rec = new Ctor();
    recognition.current = rec;
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) void submit(transcript);
    };
    rec.onerror = (event) => {
      setError(event.error === "not-allowed" ? "I can't hear you unless the microphone is allowed." : "I didn't catch that. Please try again.");
      setPhase("idle");
    };
    rec.onend = () => setPhase((current) => (current === "listening" ? "idle" : current));
    setPhase("listening");
    rec.start();
  }, [submit]);

  const askAgain = () => {
    setResult(null);
    setError(null);
    setPhase("idle");
  };

  const resultStyle = result ? (RESULT_STYLE[result.status] ?? "bg-info-soft") : "";

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
      <header className="mb-8 flex items-center gap-2 text-brand-deep">
        <LeashMark className="h-7 w-7" />
        <span className="text-xl font-semibold">Leash</span>
        <Link href="/" className="ml-auto text-base font-semibold text-brand">
          Console
        </Link>
      </header>

      <h1 className="text-4xl font-semibold">Talk to pay</h1>
      <p className="mt-2 text-xl text-ink-soft">
        Tap the microphone and say what you want to pay. Leash listens, checks it, and keeps the money safe.
      </p>

      <div aria-live="polite" className="mt-10">
        {phase === "idle" && (
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={listen}
              aria-label="Tap and speak"
              className="flex h-[120px] w-[120px] flex-col items-center justify-center rounded-full bg-brand text-white shadow-lg hover:bg-brand/90"
            >
              {/* Microphone icon */}
              <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="9" y="2.5" width="6" height="11" rx="3" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
              </svg>
              <span className="mt-1 text-base font-semibold">Tap</span>
            </button>
            <p className="text-xl font-medium">Tap and speak</p>
            <p className="text-center text-lg text-muted">For example: &ldquo;Send two thousand dollars to Arjun.&rdquo;</p>
          </div>
        )}

        {phase === "listening" && (
          <div className="flex flex-col items-center gap-4">
            <span className="listening-ring flex h-[120px] w-[120px] items-center justify-center rounded-full bg-brand text-white">
              <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="9" y="2.5" width="6" height="11" rx="3" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
              </svg>
            </span>
            <p className="text-xl font-medium">Listening…</p>
            <button type="button" onClick={() => recognition.current?.abort()} className="text-lg font-semibold text-brand">
              Stop
            </button>
          </div>
        )}

        {phase === "thinking" && (
          <div className="flex flex-col items-center gap-4">
            <span className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-info-soft text-info">
              <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 3a7 7 0 0 1 7 7c0 2.5-1.3 4-2.5 5.2-.7.7-1 1.4-1 2.3v.5h-7v-.5c0-.9-.3-1.6-1-2.3C6.3 14 5 12.5 5 10a7 7 0 0 1 7-7Z" />
              </svg>
            </span>
            <p className="text-xl font-medium">Checking your request…</p>
          </div>
        )}

        {phase === "result" && result && (
          <article className={`overflow-hidden rounded-2xl border border-line shadow-sm ${resultStyle}`}>
            <div className="space-y-3 px-6 py-5">
              <StatusBadge status={result.status} />
              <p className="text-3xl font-semibold tabular-nums">{formatUsd(result.totalCents)}</p>
              <p className="text-xl">
                {result.kind === "transfer" ? "to" : "at"} <strong>{result.payeeName}</strong>
                {result.request.payee.paypalEmail && <span className="block text-lg text-ink-soft">{result.request.payee.paypalEmail}</span>}
              </p>
              <p className="text-2xl font-medium">{result.explanation}</p>
              {result.status === "held" && (
                <p className="text-lg">
                  {result.ownerName} will check it on their phone.{" "}
                  <Link href={`/approve/${result.id}`} className="font-semibold text-brand">
                    Show what they see
                  </Link>
                </p>
              )}
              {result.status === "awaiting_payer" && result.approveUrl && (
                <a href={result.approveUrl} className="inline-block rounded-xl bg-brand px-4 py-3 text-lg font-semibold text-white">
                  Continue in PayPal
                </a>
              )}
              <div className="flex flex-wrap gap-3 pt-1">
                <button type="button" onClick={() => result.explanation && speak(result.explanation)} className="rounded-xl border border-line bg-card px-4 py-2.5 text-lg font-semibold">
                  Say it again
                </button>
                <button type="button" onClick={askAgain} className="rounded-xl border border-line bg-card px-4 py-2.5 text-lg font-semibold">
                  Ask again
                </button>
              </div>
            </div>
          </article>
        )}
      </div>

      {error && <p className="mt-6 rounded-xl bg-block-soft px-4 py-3 text-xl text-block">{error}</p>}

      <section className="mt-10 space-y-4 border-t border-line pt-6">
        <button type="button" onClick={() => setShowTyping((v) => !v)} aria-expanded={showTyping} className="text-lg font-semibold text-brand">
          {showTyping ? "Hide typing" : "Type instead"}
        </button>
        {showTyping && (
          <div className="space-y-3">
            <label htmlFor="typed-request" className="block text-lg font-medium">
              What would you like to pay?
            </label>
            <textarea
              id="typed-request"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              rows={2}
              placeholder="Send two thousand dollars to Arjun"
              className="w-full rounded-xl border border-line bg-card px-4 py-3 text-xl"
            />
            <button
              type="button"
              onClick={() => void submit(typed)}
              disabled={typed.trim().length < 2 || phase === "thinking"}
              className="w-full rounded-xl bg-brand px-4 py-3 text-lg font-semibold text-white disabled:opacity-50"
            >
              {phase === "thinking" ? "Checking…" : "Send this request"}
            </button>
          </div>
        )}

        <details className="rounded-xl border border-line bg-card px-4 py-3">
          <summary className="cursor-pointer text-lg font-medium">What the caller said (optional, for this demo)</summary>
          <p className="mt-2 text-base text-muted">
            If a caller told you what to pay, put their words here. Leash checks these words too. To send to an
            account the caller gave, say so, for example &ldquo;to the PayPal he gave me&rdquo;; Leash never takes a
            caller&apos;s account on its own.
          </p>
          <textarea
            value={callerNote}
            onChange={(e) => setCallerNote(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-base"
            aria-label="What the caller said"
          />
        </details>

        <p className="text-base text-muted">
          Nothing is sent without a check. If something looks wrong, your family will look at it first.
        </p>
      </section>
    </main>
  );
}
