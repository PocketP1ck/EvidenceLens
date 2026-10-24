import type { SourceRecord } from "@/lib/adapters/types";
import type { Brief, Direction, EvidenceFile, Finding } from "@/lib/harness/types";
import { DIRECTION_COLOR, esc, FONT, PALETTE, textLines, wrap } from "./svg";

export interface MapNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SourceGroup {
  key: string;
  sourceIds: string[];
  label: string;
  sub: string;
  findingIds: string[];
}

export interface EvidenceMapLayout {
  width: number;
  height: number;
  hypothesis: MapNode;
  columns: { direction: Direction; x: number; label: string }[];
  findings: (MapNode & { finding: Finding })[];
  groups: (MapNode & { group: SourceGroup })[];
}

const W = 1160;
const CARD_W = 300;
const CARD_H = 74;
const GAP = 14;
const SRC_W = 196;
const SRC_H = 46;

export function shortId(id: string) {
  return id
    .replace(/^ctgov:/, "")
    .replace(/^pmid:/, "PMID ")
    .replace(/^pmcid:/, "")
    .replace(/^chembl:/, "")
    .replace(/^uniprot:/, "UniProt ")
    .replace(/^pdb:/, "PDB ")
    .replace(/^alphafold:/, "")
    .replace(/^epmc:[A-Z]+:/, "")
    .replace(/^ot:.*/, "Open Targets");
}

/** One node per study cluster: duplicates across databases are merged, never double-counted. */
export function sourceGroups(evidence: EvidenceFile, sources: SourceRecord[]): SourceGroup[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const clusterById = new Map(evidence.clusters.map((c) => [c.id, c]));
  const clusterOf = new Map<string, string>();
  for (const c of evidence.clusters) for (const s of c.sourceIds) clusterOf.set(s, c.id);
  const groups = new Map<string, SourceGroup>();
  for (const f of evidence.findings) {
    for (const sid of f.sourceIds) {
      const key = clusterOf.get(sid) ?? sid;
      const g = groups.get(key) ?? { key, sourceIds: [], label: "", sub: "", findingIds: [] };
      if (!g.findingIds.includes(f.id)) g.findingIds.push(f.id);
      groups.set(key, g);
    }
  }
  for (const g of groups.values()) {
    const members = clusterById.get(g.key)?.sourceIds ?? [g.key];
    g.sourceIds = [...members].sort((a, b) => (a.startsWith("ctgov:") ? -1 : 0) - (b.startsWith("ctgov:") ? -1 : 0) || a.localeCompare(b));
    const rep = byId.get(g.sourceIds[0]);
    if (g.sourceIds.length > 1) {
      g.label = `${shortId(g.sourceIds[0])} · one study`;
      g.sub = `+ ${g.sourceIds.slice(1).map(shortId).join(", ")}`;
    } else {
      g.label = shortId(g.sourceIds[0]);
      g.sub = rep ? `${rep.source}${rep.year ? `, ${rep.year}` : ""}` : "";
    }
  }
  return [...groups.values()];
}

export function layoutEvidenceMap(brief: Pick<Brief, "title" | "assessment">, evidence: EvidenceFile, sources: SourceRecord[]): EvidenceMapLayout {
  const columns: EvidenceMapLayout["columns"] = [
    { direction: "supports", x: 40, label: "SUPPORTS" },
    { direction: "context", x: W / 2 - CARD_W / 2, label: "CONTEXT" },
    { direction: "opposes", x: W - 40 - CARD_W, label: "OPPOSES" },
  ];
  const hypothesis: MapNode = { id: "hypothesis", x: W / 2 - 200, y: 84, w: 400, h: 76 };
  const top = hypothesis.y + hypothesis.h + 76;
  const findings: EvidenceMapLayout["findings"] = [];
  for (const col of columns) {
    evidence.findings
      .filter((f) => f.direction === col.direction)
      .forEach((f, i) => findings.push({ id: f.id, finding: f, x: col.x, y: top + i * (CARD_H + GAP), w: CARD_W, h: CARD_H }));
  }
  const findingsBottom = Math.max(top, ...findings.map((n) => n.y + n.h));
  const centerX = new Map(findings.map((n) => [n.id, n.x + n.w / 2]));
  const groups = sourceGroups(evidence, sources)
    .map((g) => ({ g, want: avg(g.findingIds.map((id) => centerX.get(id) ?? W / 2)) }))
    .sort((a, b) => a.want - b.want);
  const perRow = Math.max(1, Math.floor((W - 40) / (SRC_W + 16)));
  const placed: EvidenceMapLayout["groups"] = [];
  for (let r = 0; r * perRow < groups.length; r++) {
    const row = groups.slice(r * perRow, (r + 1) * perRow);
    const rowW = row.length * SRC_W + (row.length - 1) * 16;
    const x0 = (W - rowW) / 2;
    row.forEach(({ g }, i) => placed.push({ id: g.key, group: g, x: x0 + i * (SRC_W + 16), y: findingsBottom + 84 + r * (SRC_H + 18), w: SRC_W, h: SRC_H }));
  }
  const bottom = Math.max(findingsBottom, ...placed.map((n) => n.y + n.h)) + 40;
  return { width: W, height: Math.max(bottom, 360), hypothesis, columns, findings, groups: placed };
}

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function vcurve(x1: number, y1: number, x2: number, y2: number) {
  const my = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
}

export function evidenceMapSvg(brief: Pick<Brief, "title" | "assessment">, evidence: EvidenceFile, sources: SourceRecord[]): string {
  const L = layoutEvidenceMap(brief, evidence, sources);
  const count = (d: Direction) => evidence.findings.filter((f) => f.direction === d).length;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" role="img" aria-labelledby="em-title em-desc" ${FONT}>`,
    `<title id="em-title">Evidence map: ${esc(brief.title)}</title>`,
    `<desc id="em-desc">${count("supports")} supporting, ${count("opposes")} opposing and ${count("context")} context findings linked to ${L.groups.length} distinct studies or records.</desc>`,
    `<rect width="100%" height="100%" fill="${PALETTE.paper}"/>`,
    `<text x="40" y="40" font-size="13" font-weight="600" fill="${PALETTE.ink}" letter-spacing="0.08em">EVIDENCE MAP</text>`,
    `<text x="40" y="60" font-size="12" fill="${PALETTE.ink2}">Hypothesis → findings → sources. Records sharing a PMID, NCT, DOI or protocol ID are merged into one study node.</text>`,
  ];
  const h = L.hypothesis;
  const topY = h.y + h.h + 76;
  for (const col of L.columns) {
    const n = count(col.direction);
    parts.push(
      `<text x="${col.x}" y="${topY - 14}" font-size="10.5" font-weight="700" letter-spacing="0.12em" fill="${DIRECTION_COLOR[col.direction]}">${col.label} · ${n}</text>`,
    );
    if (!n) parts.push(`<text x="${col.x}" y="${topY + 22}" font-size="11.5" fill="${PALETTE.mute}">None recorded</text>`);
  }
  // Edges hypothesis → each non-empty column header
  for (const col of L.columns) {
    if (!count(col.direction)) continue;
    parts.push(
      `<path d="${vcurve(h.x + h.w / 2, h.y + h.h, col.x + 70, topY - 30)}" fill="none" stroke="${DIRECTION_COLOR[col.direction]}" stroke-width="1.4" opacity="0.6"/>`,
    );
  }
  // Edges finding → source: out of the card's right edge, down a gutter, then to the source node.
  const colBottom = new Map<Direction, number>();
  for (const n of L.findings) colBottom.set(n.finding.direction, Math.max(colBottom.get(n.finding.direction) ?? 0, n.y + n.h));
  for (const g of L.groups) {
    for (const fid of g.group.findingIds) {
      const n = L.findings.find((x) => x.id === fid);
      if (!n) continue;
      const gx = n.x + n.w + 12;
      const yb = (colBottom.get(n.finding.direction) ?? n.y + n.h) + 18;
      const d = `M${n.x + n.w},${n.y + n.h / 2} H${gx} V${yb} ${vcurve(gx, yb, g.x + g.w / 2, g.y).replace(/^M[^C]+/, "")}`;
      parts.push(`<path d="${d}" fill="none" stroke="${DIRECTION_COLOR[n.finding.direction]}" stroke-width="1" stroke-dasharray="3 3" opacity="0.65" data-finding="${fid}"/>`);
    }
  }
  const assessColor = brief.assessment === "supported" ? PALETTE.teal : brief.assessment === "opposed" ? PALETTE.focus : PALETTE.slate;
  parts.push(
    `<g data-node="hypothesis"><rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="14" fill="${PALETTE.paper}" stroke="${PALETTE.ink}" stroke-width="1.2"/>`,
    `<text x="${h.x + 18}" y="${h.y + 22}" font-size="10" letter-spacing="0.12em" fill="${PALETTE.ink2}">HYPOTHESIS</text>`,
    `<text x="${h.x + h.w - 18}" y="${h.y + 22}" font-size="10.5" font-weight="700" letter-spacing="0.1em" text-anchor="end" fill="${assessColor}">${esc(brief.assessment.toUpperCase())}</text>`,
    textLines(wrap(brief.title, 54, 2), h.x + 18, h.y + 44, 17, `font-size="13.5" font-weight="600" fill="${PALETTE.ink}"`),
    `</g>`,
  );
  for (const n of L.findings) {
    const f = n.finding;
    const color = DIRECTION_COLOR[f.direction];
    parts.push(
      `<g data-finding="${f.id}" tabindex="0"><title>${esc(`${f.id} (${f.direction}, ${f.kind}): ${f.claim}`)}</title>`,
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${PALETTE.paper}" stroke="${color}" stroke-width="1.1"/>`,
      `<rect x="${n.x}" y="${n.y + 12}" width="3" height="${n.h - 24}" rx="1.5" fill="${color}"/>`,
      `<text x="${n.x + 16}" y="${n.y + 20}" font-size="10" font-weight="700" fill="${color}" letter-spacing="0.06em">${esc(f.id)}<tspan font-weight="500" fill="${PALETTE.ink2}" dx="8">${esc(`${f.kind} · ${f.outcome.replace("_", " ")}`)}</tspan></text>`,
      textLines(wrap(f.claim, 48, 3), n.x + 16, n.y + 37, 13.5, `font-size="11.2" fill="${PALETTE.ink}"`),
      `</g>`,
    );
  }
  for (const g of L.groups) {
    parts.push(
      `<g data-group="${esc(g.id)}"><title>${esc(g.group.sourceIds.join(", "))}</title>`,
      `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${g.h / 2}" fill="${PALETTE.paper}" stroke="${g.group.sourceIds.length > 1 ? PALETTE.slate : PALETTE.line}" stroke-width="1"/>`,
      `<text x="${g.x + 18}" y="${g.y + 19}" font-size="11" font-weight="600" fill="${PALETTE.ink}">${esc(wrap(g.group.label, 30, 1)[0] ?? "")}</text>`,
      `<text x="${g.x + 18}" y="${g.y + 34}" font-size="10" fill="${PALETTE.ink2}">${esc(wrap(g.group.sub, 32, 1)[0] ?? "")}</text>`,
      `</g>`,
    );
  }
  parts.push(`</svg>`);
  return parts.join("");
}
