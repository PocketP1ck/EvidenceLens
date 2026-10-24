"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SourceRecord } from "@/lib/adapters/types";
import type { Brief, BriefItem, EvidenceFile, Finding, RunEvent, RunMeta } from "@/lib/harness/types";
import { ASSESSMENT_TEXT } from "@/components/Chrome";
import { StructureViewer } from "./StructureViewer";

export type LeanSource = Omit<SourceRecord, "text" | "data"> & { data?: Record<string, unknown> };

export interface ReportProps {
  run: RunMeta;
  brief: Brief | null;
  evidence: EvidenceFile;
  sources: LeanSource[];
  citeIndex: Record<string, number>;
  mapSvg: string;
  timelineSvg: string;
  events: RunEvent[];
  hasStructurePng: boolean;
}

function flash(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1800);
}

function Cites({ nums }: { nums: number[] }) {
  if (!nums.length) return null;
  return (
    <span className="cite">
      {nums.map((n) => (
        <a
          key={n}
          href={`#src-${n}`}
          onClick={(e) => {
            e.preventDefault();
            flash(`src-${n}`);
          }}
          aria-label={`Source ${n}`}
        >
          [{n}]
        </a>
      ))}
    </span>
  );
}

export function ReportView(p: ReportProps) {
  const { run, brief, evidence, sources, citeIndex } = p;
  const findingById = useMemo(() => new Map(evidence.findings.map((f) => [f.id, f])), [evidence.findings]);
  const srcById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const numsFor = (fids: string[]) =>
    [...new Set(fids.flatMap((fid) => findingById.get(fid)?.sourceIds ?? []).map((s) => citeIndex[s]).filter(Boolean))].sort((a, b) => a - b);
  const numsForSources = (sids: string[]) => [...new Set(sids.map((s) => citeIndex[s]).filter(Boolean))].sort((a, b) => a - b);
  const [tab, setTab] = useState<"all" | "supports" | "opposes" | "context" | "gaps">("all");
  const [hot, setHot] = useState<string | null>(null);

  const Item = ({ item }: { item: BriefItem }) => (
    <li>
      {item.text}
      <Cites nums={numsFor(item.findingIds)} />
      <span className="fid">{item.findingIds.join(" ")}</span>
    </li>
  );

  const cited = Object.entries(citeIndex)
    .sort((a, b) => a[1] - b[1])
    .map(([sid, n]) => ({ n, s: srcById.get(sid) }))
    .filter((x): x is { n: number; s: LeanSource } => Boolean(x.s));
  const uncited = sources.filter((s) => !citeIndex[s.id]);
  const clusterOf = new Map(evidence.clusters.flatMap((c) => c.sourceIds.map((s) => [s, c] as const)));

  const rows: Finding[] = tab === "all" || tab === "gaps" ? evidence.findings : evidence.findings.filter((f) => f.direction === tab);
  const counts = {
    supports: evidence.findings.filter((f) => f.direction === "supports").length,
    opposes: evidence.findings.filter((f) => f.direction === "opposes").length,
    context: evidence.findings.filter((f) => f.direction === "context").length,
  };

  const onMapOver = (e: React.MouseEvent) => {
    const el = (e.target as Element).closest("[data-finding]");
    setHot(el?.getAttribute("data-finding") ?? null);
  };
  const onMapClick = (e: React.MouseEvent) => {
    const el = (e.target as Element).closest("[data-finding]");
    const fid = el?.getAttribute("data-finding");
    if (fid) {
      setTab("all");
      setTimeout(() => flash(`finding-${fid}`), 50);
    }
  };
  const mapHtml = useMemo(() => {
    if (!hot) return p.mapSvg;
    // Mark the hovered finding and its edges; CSS dims the rest.
    return p.mapSvg.replaceAll(`data-finding="${hot}"`, `data-finding="${hot}" class="hot"`);
  }, [hot, p.mapSvg]);

  return (
    <article>
      <header className="report-head">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/">← Investigations</Link>
          <span className="sep">/</span>
          <span className="mono">investigations/{run.id}/</span>
        </nav>
        {brief ? (
          <>
            <span className={`pill ${brief.assessment}`}>{ASSESSMENT_TEXT[brief.assessment]} by retrieved evidence</span>
            <h1>{brief.title}</h1>
            <p className="question">{brief.question}</p>
            <div className="verdict">
              <p>
                {brief.summary.text}
                <Cites nums={numsFor(brief.summary.findingIds)} />
              </p>
            </div>
          </>
        ) : (
          <>
            <span className={`pill ${run.status}`}>{run.status}</span>
            <h1>{run.goal}</h1>
            <p className="question">This run ended before a brief was written: {run.stopReason}</p>
          </>
        )}
        <div className="head-actions">
          {brief && (
            <a className="btn quiet" href={`/api/investigations/${run.id}/brief`} download={`${run.id}-brief.md`}>
              Export brief.md
            </a>
          )}
          <span className="meta-line">
            {run.model} · {new Date(run.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {run.usage.calls} model calls · API cost ${run.usage.usd.toFixed(2)} · {sources.length} sources retrieved
          </span>
        </div>
      </header>

      <div className="grid-2">
        {evidence.structure?.localFile ? (
          <StructureViewer runId={run.id} structure={evidence.structure} hasPng={p.hasStructurePng} />
        ) : (
          <div className="card">
            <h3>3D structure</h3>
            <p className="sub">No suitable structure was retrieved for this question. The gap is recorded in the evidence ledger rather than replaced with an unrelated model.</p>
          </div>
        )}
        <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
          {brief && (
            <>
              <section className="card opposing" aria-labelledby="opp">
                <h3 id="opp">Opposing evidence</h3>
                <p className="sub">What would make this hypothesis wrong, from retrieved records.</p>
                {brief.opposingEvidence.length ? (
                  <ul>
                    {brief.opposingEvidence.map((it, i) => (
                      <Item key={i} item={it} />
                    ))}
                  </ul>
                ) : (
                  <p className="sub">No opposing evidence was retrieved.</p>
                )}
              </section>
              <section className="card supporting" aria-labelledby="key">
                <h3 id="key">Key findings</h3>
                <ul>
                  {brief.keyFindings.map((it, i) => (
                    <Item key={i} item={it} />
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>

      <section className="figure" aria-labelledby="map-title">
        <div className="section-head">
          <h2 id="map-title">Evidence relationships</h2>
          <span className="hint">
            {counts.supports} supporting · {counts.opposes} opposing · {counts.context} context · hover a finding to trace it
          </span>
        </div>
        <div
          className={`figure-svg${hot ? " dim" : ""}`}
          onMouseOver={onMapOver}
          onMouseLeave={() => setHot(null)}
          onClick={onMapClick}
          dangerouslySetInnerHTML={{ __html: mapHtml }}
        />
        <div className="figure-caption">
          <span>Generated from the evidence ledger. Records sharing a PMID, NCT number, DOI or protocol ID are one node.</span>
          <a href={`/api/investigations/${run.id}/files/figures/evidence-map.svg`} target="_blank" rel="noreferrer">
            figures/evidence-map.svg
          </a>
        </div>
      </section>

      {brief && (
        <div className="three-col">
          <section className="card" aria-labelledby="ctx">
            <h3 id="ctx">Context differences</h3>
            {brief.contextDifferences.length ? (
              <ul>
                {brief.contextDifferences.map((it, i) => (
                  <Item key={i} item={it} />
                ))}
              </ul>
            ) : (
              <p className="sub">None recorded.</p>
            )}
          </section>
          <section className="card" aria-labelledby="lim">
            <h3 id="lim">Limitations & unknowns</h3>
            <ul>
              {[...brief.limitations, ...brief.unknowns].map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
          <section className="card" aria-labelledby="next">
            <h3 id="next">Next research questions</h3>
            <ul>
              {brief.nextQuestions.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <section className="figure" aria-labelledby="tl-title2">
        <div className="section-head">
          <h2 id="tl-title2">Studies over time</h2>
          <span className="hint">Trial registrations and publications cited by findings</span>
        </div>
        <div className="figure-svg" dangerouslySetInnerHTML={{ __html: p.timelineSvg }} />
        <div className="figure-caption">
          <span>Bars run from trial start to completion as registered on ClinicalTrials.gov.</span>
          <a href={`/api/investigations/${run.id}/files/figures/timeline.svg`} target="_blank" rel="noreferrer">
            figures/timeline.svg
          </a>
        </div>
        {evidence.comparisons.length > 0 && (
          <div className="card" style={{ marginTop: 20, overflowX: "auto" }}>
            <h3>Trial comparison</h3>
            <p className="sub">Computed in code from the retrieved registrations.</p>
            <table className="cmp">
              <thead>
                <tr>
                  <th scope="col">Trial</th>
                  <th scope="col">Design</th>
                  <th scope="col">Population</th>
                  <th scope="col">Status</th>
                  <th scope="col">Primary endpoint</th>
                  <th scope="col">Key result</th>
                </tr>
              </thead>
              <tbody>
                {evidence.comparisons.at(-1)!.rows.map((r) => (
                  <tr key={r.sourceId}>
                    <td>
                      <strong>{r.label}</strong>
                      <Cites nums={numsForSources([r.sourceId])} />
                      <div className="ctx">
                        {r.phase} · n={r.enrollment ?? "?"}
                      </div>
                    </td>
                    <td>{r.design}</td>
                    <td>{r.population}</td>
                    <td>{r.status}</td>
                    <td>{r.primaryEndpoint}</td>
                    <td>{r.keyResult}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="ledger-title">
        <div className="section-head">
          <h2 id="ledger-title">Evidence ledger</h2>
          <span className="hint">Each claim with its context and the passage it rests on</span>
        </div>
        <div className="tabs" role="tablist" aria-label="Filter findings">
          {(
            [
              ["all", `All ${evidence.findings.length}`],
              ["supports", `Supports ${counts.supports}`],
              ["opposes", `Opposes ${counts.opposes}`],
              ["context", `Context ${counts.context}`],
              ["gaps", `Not retrieved ${evidence.gaps.length}`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "gaps" ? (
          evidence.gaps.length ? (
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Evidence that could not be retrieved</th>
                  <th scope="col">What was attempted</th>
                </tr>
              </thead>
              <tbody>
                {evidence.gaps.map((g) => (
                  <tr key={g.id}>
                    <td className="mono">{g.id}</td>
                    <td>{g.description}</td>
                    <td className="ctx">{g.attempted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No gaps recorded.</p>
          )
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Direction</th>
                  <th scope="col">Claim</th>
                  <th scope="col">Population · endpoint</th>
                  <th scope="col">Studies</th>
                  <th scope="col">Sources</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} id={`finding-${f.id}`}>
                    <td className="mono">{f.id}</td>
                    <td>
                      <span className={`dir ${f.direction}`}>{f.direction}</span>
                      <div className="ctx">
                        {f.kind} · {f.outcome.replace("_", " ")}
                      </div>
                    </td>
                    <td>
                      {f.claim}
                      {f.supportingPassage && <blockquote className="quote">“{f.supportingPassage}”</blockquote>}
                      {(f.studyContext || f.limitations) && <div className="ctx">{[f.studyContext, f.limitations && `Limitations: ${f.limitations}`].filter(Boolean).join(" · ")}</div>}
                    </td>
                    <td className="ctx" style={{ minWidth: 160 }}>
                      {[f.intervention, f.disease, f.population, f.species, f.endpoint].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td title="Distinct studies among cited records">{f.independentStudies}</td>
                    <td>
                      <Cites nums={numsForSources(f.sourceIds)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="src-title">
        <div className="section-head">
          <h2 id="src-title">Sources</h2>
          <span className="hint">Only records retrieved during this run can be cited</span>
        </div>
        <ol className="sources">
          {cited.map(({ n, s }) => (
            <li key={s.id} id={`src-${n}`}>
              <span className="n">[{n}]</span>
              <span>
                <a className="t" href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <div className="m">
                  {s.source} · <code>{s.id}</code>
                  {s.year ? ` · ${s.year}` : ""} · retrieved {new Date(s.retrievedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  {clusterOf.has(s.id) && ` · linked with ${clusterOf.get(s.id)!.sourceIds.filter((x) => x !== s.id).join(", ")} (one study)`}
                </div>
              </span>
            </li>
          ))}
        </ol>
        {uncited.length > 0 && (
          <details className="trace">
            <summary>
              {uncited.length} more records were retrieved but not cited
            </summary>
            <ul className="sources">
              {uncited.map((s) => (
                <li key={s.id}>
                  <span className="n">·</span>
                  <span>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                    <div className="m">
                      {s.source} · <code>{s.id}</code>
                    </div>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <details className="trace">
        <summary>Execution trace ({p.events.filter((e) => e.type === "stage").length} tool calls)</summary>
        <ol>
          {p.events
            .filter((e) => e.type === "stage" || (e.type === "tool_result" && !e.ok) || e.type === "notice" || e.type === "finished")
            .map((e) => (
              <li key={e.seq} className={e.type === "tool_result" ? "err" : undefined}>
                <span className="mono">{new Date(e.at).toLocaleTimeString("en-US", { hour12: false })}</span>{" "}
                {e.type === "stage" ? `[${e.stage}] ${e.label}` : e.type === "tool_result" ? `rejected: ${e.summary}` : e.type === "notice" ? `notice: ${e.message}` : e.type === "finished" ? `${e.status}: ${e.stopReason}` : ""}
              </li>
            ))}
        </ol>
        <p className="meta-line">
          Tool calls and harness decisions only. The model&apos;s private reasoning is not recorded or shown.
        </p>
      </details>
    </article>
  );
}
