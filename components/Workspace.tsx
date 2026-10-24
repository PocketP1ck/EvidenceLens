"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { InvestigationSummary } from "@/lib/harness/store";
import type { RunEvent } from "@/lib/harness/types";
import { initialActivity, reduceActivity, type ActivityState } from "@/lib/stage";
import { Otter } from "./Otter";
import { InvestigationList } from "./InvestigationList";
import { ASSESSMENT_TEXT } from "./Chrome";

const EXAMPLES = [
  { label: "IL-17A in Crohn's disease", goal: "Would inhibiting IL-17A help patients with Crohn's disease?", target: "IL17A", disease: "Crohn's disease", compound: "secukinumab" },
  { label: "IL-23 (p19) in Crohn's disease", goal: "Would blocking the IL-23 p19 subunit help patients with Crohn's disease?", target: "IL23A", disease: "Crohn's disease", compound: "risankizumab" },
];

type Action = { type: "event"; event: RunEvent } | { type: "reset" };

function reducer(state: ActivityState, a: Action): ActivityState {
  return a.type === "reset" ? initialActivity() : reduceActivity(state, a.event);
}

export interface WorkspaceProps {
  initial: InvestigationSummary[];
  replay?: { id: string; goal: string; target?: string; disease?: string; compound?: string; speed: number } | null;
  model?: "sonnet" | "haiku";
}

export function Workspace({ initial, replay, model }: WorkspaceProps) {
  const [goal, setGoal] = useState("");
  const [ctx, setCtx] = useState({ target: "", disease: "", compound: "" });
  const [showCtx, setShowCtx] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [typing, setTyping] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [items, setItems] = useState(initial);
  const [activity, dispatch] = useReducer(reducer, undefined, initialActivity);
  const esRef = useRef<EventSource | null>(null);

  const refreshList = useCallback(async () => {
    const res = await fetch("/api/investigations", { cache: "no-store" });
    if (res.ok) setItems((await res.json()).investigations);
  }, []);

  const listen = useCallback(
    (id: string, query = "") => {
      esRef.current?.close();
      const es = new EventSource(`/api/investigations/${id}/events${query}`);
      esRef.current = es;
      es.onmessage = (msg) => {
        const data = JSON.parse(msg.data) as RunEvent | { type: "replay_end" };
        if (data.type === "replay_end") return es.close();
        dispatch({ type: "event", event: data });
        if (data.type === "finished") {
          es.close();
          setRunning(false);
          refreshList();
        }
      };
      es.onerror = () => {
        // The stream closes normally at the end of a run; only report if still running.
        if (es.readyState === EventSource.CLOSED) setRunning(false);
      };
    },
    [refreshList],
  );

  useEffect(() => () => esRef.current?.close(), []);

  // Replay mode for recording: type the saved goal, press start, replay saved events. No API calls.
  useEffect(() => {
    if (!replay) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTyping(true);
    const text = replay.goal;
    const step = reduced ? 0 : 38;
    for (let i = 1; i <= text.length; i++) timers.push(setTimeout(() => !cancelled && setGoal(text.slice(0, i)), 900 + i * step));
    const done = 900 + text.length * step + 500;
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setTyping(false);
        setPressed(true);
        timers.push(setTimeout(() => setPressed(false), 180));
        dispatch({ type: "reset" });
        setRunId(replay.id);
        setRunning(true);
        listen(replay.id, `?replay=1&speed=${replay.speed}`);
      }, done),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [replay, listen]);

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    // Replay pages never start paid runs.
    if (running || replay) return;
    setError(null);
    const trimmed = goal.trim();
    if (trimmed.length < 10) return setError("Describe the research goal in a sentence.");
    setRunning(true);
    dispatch({ type: "reset" });
    try {
      const res = await fetch("/api/investigations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal: trimmed, ...ctx, model }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not start the investigation.");
      setRunId(body.id);
      listen(body.id);
    } catch (err) {
      setRunning(false);
      setError((err as Error).message);
    }
  }

  async function stop() {
    if (runId && !replay) await fetch(`/api/investigations/${runId}`, { method: "DELETE" });
  }

  const fin = activity.finished;

  return (
    <>
      <section className="hero">
        <div>
          <span className="eyebrow">Drug-discovery research, with the counterevidence</span>
          <h1>What should I investigate?</h1>
          <p className="lede">
            Give the agent a hypothesis. It plans, retrieves trials, papers, targets and structures, looks for reasons the idea could be wrong, and leaves a
            source-backed research folder.
          </p>
          <form className="goal-form" onSubmit={start}>
            <div className="goal-field">
              <label htmlFor="goal" className="eyebrow">
                Research goal
              </label>
              <textarea
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="e.g. Would inhibiting IL-17A help patients with Crohn's disease?"
                disabled={running || typing}
                maxLength={400}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
                }}
              />
            </div>
            {showCtx && !replay && (
              <div className="context-grid">
                {(["target", "disease", "compound"] as const).map((k) => (
                  <label className="field" key={k}>
                    <span>{k[0].toUpperCase() + k.slice(1)} (optional)</span>
                    <input value={ctx[k]} onChange={(e) => setCtx({ ...ctx, [k]: e.target.value })} disabled={running} maxLength={80} />
                  </label>
                ))}
              </div>
            )}
            <div className="form-row">
              <div className="chips">
                {!replay &&
                  !running &&
                  EXAMPLES.map((ex) => (
                    <button
                      type="button"
                      className="chip"
                      key={ex.label}
                      onClick={() => {
                        setGoal(ex.goal);
                        setCtx({ target: ex.target, disease: ex.disease, compound: ex.compound });
                      }}
                    >
                      {ex.label}
                    </button>
                  ))}
                {!replay && !running && (
                  <button type="button" className="link-btn" onClick={() => setShowCtx((s) => !s)} aria-expanded={showCtx}>
                    {showCtx ? "Hide context" : "Add context"}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {running && !replay && (
                  <button type="button" className="btn quiet" onClick={stop}>
                    Stop
                  </button>
                )}
                <button
                  type="submit"
                  className={`btn${pressed ? " pressed" : ""}`}
                  disabled={running || typing || goal.trim().length < 10 || (Boolean(replay) && Boolean(activity.finished))}
                >
                  {running ? "Investigating…" : activity.finished && replay ? "Investigation complete" : "Begin investigation"}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </div>

        <div className="stage">
          <div className="stage-ring" aria-hidden="true" />
          <Otter pose={activity.pose} size={340} />
          <div className={`status${activity.pose === "stopped" ? " stopped" : ""}`} aria-live="polite" aria-atomic="true">
            <div className="status-stage">{activity.stageWord}</div>
            <div className="status-label">{activity.label}</div>
            {activity.previous && running && <div className="status-prev">{activity.previous}</div>}
          </div>
        </div>
      </section>

      {fin && fin.status === "completed" && runId && (
        <div className="result-card" role="status">
          <span className={`pill ${fin.assessment}`}>{ASSESSMENT_TEXT[fin.assessment ?? "insufficient"]}</span>
          <h2>{fin.title}</h2>
          <p>{fin.summary}</p>
          <div className="head-actions">
            <Link className="btn" href={`/investigations/${runId}`}>
              Open the research <span aria-hidden="true">→</span>
            </Link>
            <span className="meta-line">
              {activity.findings.length} findings recorded · saved to investigations/{runId}/
            </span>
          </div>
        </div>
      )}

      <InvestigationList items={items} />
    </>
  );
}
