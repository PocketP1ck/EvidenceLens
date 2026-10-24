"use client";

import { useEffect, useRef, useState } from "react";
import type { StructureChoice } from "@/lib/adapters/structures";

/** AlphaFold's published pLDDT bands, kept as-is so readers recognise them. */
const PLDDT = [
  { min: 90, color: "#0053D6", label: "Very high (>90)" },
  { min: 70, color: "#65CBF3", label: "Confident (70–90)" },
  { min: 50, color: "#FFDB13", label: "Low (50–70)" },
  { min: -1, color: "#FF7D45", label: "Very low (<50)" },
];
const TARGET = "#6D8BC0";
const INTERVENTION = "#525AFF";
const OTHER = "#C9D2E0";

interface Viewer {
  addModel(data: string, format: string): unknown;
  setStyle(sel: object, style: object): void;
  zoomTo(sel?: object): void;
  zoom(f: number): void;
  render(): void;
  spin(axis: string | boolean, speed?: number): void;
  pngURI(): string;
  resize(): void;
  clear(): void;
}

export function StructureViewer({ runId, structure, hasPng }: { runId: string; structure: StructureChoice; hasPng: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">(hasPng ? "saved" : "idle");
  const [spinning, setSpinning] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [$3Dmol, res] = await Promise.all([import("3dmol"), fetch(`/api/investigations/${runId}/files/structures/${structure.localFile}`)]);
        if (!res.ok) throw new Error("structure file missing");
        const data = await res.text();
        if (cancelled || !box.current) return;
        const v = ($3Dmol as unknown as { createViewer: (el: HTMLElement, cfg: object) => Viewer }).createViewer(box.current, {
          backgroundColor: "white",
          antialias: true,
        });
        viewer.current = v;
        v.addModel(data, structure.format === "cif" ? "cif" : "pdb");
        if (structure.type === "predicted") {
          v.setStyle({}, { cartoon: { colorfunc: (atom: { b: number }) => PLDDT.find((p) => atom.b > p.min)!.color, thickness: 0.4 } });
          // Frame the confident core; disordered termini stay visible but don't shrink the view.
          v.zoomTo({ predicate: (atom: { b: number }) => atom.b >= 70 });
        } else {
          v.setStyle({}, { cartoon: { color: OTHER, opacity: 0.35 } });
          const partners = structure.partnerChains.filter((p) => p.role === "intervention").flatMap((p) => p.chains);
          if (partners.length) v.setStyle({ chain: partners }, { cartoon: { color: INTERVENTION } });
          v.setStyle({ chain: structure.targetChains }, { cartoon: { color: TARGET } });
          v.zoomTo({ chain: [...structure.targetChains, ...partners] });
        }
        v.render();
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reduced) v.spin("y", 0.35);
        else setSpinning(false);
        setState("ready");
        // Save the presentation figure once, the first time the report is opened.
        if (!hasPng) setTimeout(() => !cancelled && save(), 900);
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    const onResize = () => viewer.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      viewer.current?.spin(false);
      viewer.current?.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, structure.localFile]);

  async function save() {
    const v = viewer.current;
    if (!v) return;
    setSaved("saving");
    try {
      v.render();
      const res = await fetch(`/api/investigations/${runId}/figures`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl: v.pngURI() }),
      });
      setSaved(res.ok ? "saved" : "error");
    } catch {
      setSaved("error");
    }
  }

  function toggleSpin() {
    viewer.current?.spin(spinning ? false : "y", 0.35);
    setSpinning(!spinning);
  }

  const intervention = structure.partnerChains.filter((p) => p.role === "intervention");
  const others = structure.partnerChains.filter((p) => p.role === "other");

  return (
    <div className="card viewer-card">
      <header>
        <h3>3D structure</h3>
        <p className="sub" style={{ marginBottom: 0 }}>
          {structure.title}
        </p>
      </header>
      <div className="viewer-box" ref={box} role="img" aria-label={`Interactive 3D view of ${structure.title}. Drag to rotate, scroll to zoom.`}>
        {state !== "ready" && <div className="viewer-status">{state === "loading" ? "Loading structure…" : "The structure file could not be loaded."}</div>}
      </div>
      <div className="viewer-foot">
        <div className="legend">
          {structure.type === "predicted" ? (
            PLDDT.map((p) => (
              <span key={p.label}>
                <i style={{ background: p.color }} />
                {p.label}
              </span>
            ))
          ) : (
            <>
              <span>
                <i style={{ background: TARGET }} />
                Target (chain {structure.targetChains.join(", ")})
              </span>
              {intervention.map((p) => (
                <span key={p.label}>
                  <i style={{ background: INTERVENTION }} />
                  {p.label} (chain {p.chains.join(", ")})
                </span>
              ))}
              {others.length > 0 && (
                <span>
                  <i style={{ background: OTHER }} />
                  Other entities, faded
                </span>
              )}
            </>
          )}
        </div>
        <dl className="kv">
          <dt>Model</dt>
          <dd>
            <code>{structure.modelId}</code> · {structure.type === "experimental" ? `${structure.method ?? "experimental"}${structure.resolution ? `, ${structure.resolution} Å` : ""}` : `AlphaFold prediction, mean pLDDT ${structure.meanPlddt}`}
          </dd>
          <dt>Identity</dt>
          <dd>
            {structure.identity.verified ? "✓ " : "⚠ "}
            {structure.identity.method} (UniProt {structure.identity.uniprotAccession})
          </dd>
          <dt>Why this one</dt>
          <dd>{structure.reason}</dd>
          {structure.type === "predicted" && (
            <>
              <dt>Note</dt>
              <dd>pLDDT is local structural confidence. It says nothing about disease relevance or drug binding.</dd>
            </>
          )}
          {others.length > 0 && (
            <>
              <dt>Faded</dt>
              <dd>{others.map((o) => o.label).join("; ")}</dd>
            </>
          )}
        </dl>
        <div className="head-actions">
          <button type="button" className="btn quiet" onClick={toggleSpin} disabled={state !== "ready"}>
            {spinning ? "Pause rotation" : "Rotate"}
          </button>
          <button type="button" className="btn quiet" onClick={save} disabled={state !== "ready" || saved === "saving"}>
            {saved === "saved" ? "Update saved figure" : "Save figure"}
          </button>
          <span className="meta-line" aria-live="polite">
            {saved === "saved" ? "Saved to figures/structure.png" : saved === "saving" ? "Saving…" : saved === "error" ? "Could not save the figure" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
