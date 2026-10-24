import type { SourceRecord } from "@/lib/adapters/types";
import type { Brief, EvidenceFile, Finding } from "@/lib/harness/types";
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
  side: "left" | "right";
  findingIds: string[];
}

export interface EvidenceMapLayout {
  width: number;
  height: number;
  hypothesis: MapNode;
  findings: (MapNode & { finding: Finding })[];
  groups: (MapNode & { group: SourceGroup })[];
}

const W = 1160;
const CARD_W = 250;
const CARD_H = 70;
const SRC_W = 180;
const SRC_H = 46;
const GAP = 16;

function shortId(id: string) {
  return id.replace(/^ctgov:/, "").replace(/^pmid:/, "PMID ").replace(/^chembl:/, "").replace(/^uniprot:/, "UniProt ").replace(/^pdb:/, "PDB ").replace(/^alphafold:/, "").replace(/^ot:.*/, "Open Targets");
}

/** One node per study cluster: duplicates across databases are merged, never double-counted. */
export function sourceGroups(evidence: EvidenceFile, sources: SourceRecord[]): SourceGroup[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const clusterOf = new Map<string, string>();
  for (const c of evidence.clusters) for (const s of c.sourceIds) clusterOf.set(s, c.id);
  const groups = new Map<string, SourceGroup>();
  const ordered = [
    ...evidence.findings.filter((f) => f.direction === "supports"),
    ...evidence.findings.filter((f) => f.direction === "opposes"),
    ...evidence.findings.filter((f) => f.direction === "context"),
  ];
  let leftCount = 0;
  let rightCount = 0;
  for (const f of ordered) {
    for (const sid of f.sourceIds) {
      const key = clusterOf.get(sid) ?? sid;
      let g = groups.get(key);
      if (!g) {
        const side: "left" | "right" =
          f.direction === "supports" ? "left" : f.direction === "opposes" ? "right" : leftCount <= rightCount ? "left" : "right";
        if (side === "left") leftCount++;
        else rightCount++;
        g = { key, sourceIds: [], label: "", sub: "", side, findingIds: [] };
        groups.set(key, g);
      }
      if (!g.findingIds.includes(f.id)) g.findingIds.push(f.id);
    }
  }
  for (const g of groups.values()) {
    const members = clusterOf.has(g.key) ? evidence.clusters.find((c) => c.id === g.key)!.sourceIds : [g.key];
    // Keep cited members first; include linked records so the merge is visible.
    g.sourceIds = members;
    g.label = members.map(shortId).slice(0, 3).join(" · ");
    const rep = byId.get(members.find((m) => m.startsWith("ctgov:")) ?? members[0]);
    g.sub = rep ? `${rep.source}${rep.year ? `, ${rep.year}` : ""}${members.length > 1 ? ` · ${members.length} linked records` : ""}` : "";
  }
  return [...groups.values()];
}

export function layoutEvidenceMap(brief: Pick<Brief, "title" | "assessment">, evidence: EvidenceFile, sources: SourceRecord[]): EvidenceMapLayout {
  const sup = evidence.findings.filter((f) => f.direction === "supports");
  const opp = evidence.findings.filter((f) => f.direction === "opposes");
  const ctx = evidence.findings.filter((f) => f.direction === "context");
  const top = 96;
  const colX = { srcL: 24, sup: 24 + SRC_W + 56, hyp: W / 2 - 110, opp: W - 24 - SRC_W - 56 - CARD_W, srcR: W - 24 - SRC_W };
  const findings: EvidenceMapLayout["findings"] = [];
  sup.forEach((f, i) => findings.push({ id: f.id, finding: f, x: colX.sup, y: top + i * (CARD_H + GAP), w: CARD_W, h: CARD_H }));
  opp.forEach((f, i) => findings.push({ id: f.id, finding: f, x: colX.opp, y: top + i * (CARD_H + GAP), w: CARD_W, h: CARD_H }));
  const hypothesis: MapNode = { id: "hypothesis", x: colX.hyp, y: top, w: 220, h: 96 };
  ctx.forEach((f, i) => findings.push({ id: f.id, finding: f, x: W / 2 - 125, y: hypothesis.y + hypothesis.h + 48 + i * (CARD_H + GAP), w: CARD_W, h: CARD_H }));

  const centerY = new Map(findings.map((n) => [n.id, n.y + n.h / 2]));
  const groups = sourceGroups(evidence, sources);
  const place = (side: "left" | "right") => {
    const list = groups
      .filter((g) => g.side === side)
      .map((g) => ({ g, want: avg(g.findingIds.map((id) => centerY.get(id) ?? top)) }))
      .sort((a, b) => a.want - b.want);
    let y = top - 10;
    return list.map(({ g, want }) => {
      const yy = Math.max(y, want - SRC_H / 2);
      y = yy + SRC_H + 12;
      return { id: g.key, group: g, x: side === "left" ? colX.srcL : colX.srcR, y: yy, w: SRC_W, h: SRC_H };
    });
  };
  const placed = [...place("left"), ...place("right")];
  const bottom = Math.max(hypothesis.y + hypothesis.h, ...findings.map((n) => n.y + n.h), ...placed.map((n) => n.y + n.h)) + 56;
  return { width: W, height: Math.max(bottom, 360), hypothesis, findings, groups: placed };
}

function avg(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function curve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

export function evidenceMapSvg(brief: Pick<Brief, "title" | "assessment">, evidence: EvidenceFile, sources: SourceRecord[]): string {
  const L = layoutEvidenceMap(brief, evidence, sources);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.width} ${L.height}" width="${L.width}" height="${L.height}" role="img" aria-labelledby="em-title em-desc" ${FONT}>`,
    `<title id="em-title">Evidence map: ${esc(brief.title)}</title>`,
    `<desc id="em-desc">${evidence.findings.filter((f) => f.direction === "supports").length} supporting, ${evidence.findings.filter((f) => f.direction === "opposes").length} opposing and ${evidence.findings.filter((f) => f.direction === "context").length} context findings linked to ${L.groups.length} distinct studies or records.</desc>`,
    `<rect width="100%" height="100%" fill="${PALETTE.paper}"/>`,
    `<text x="24" y="36" font-size="13" font-weight="600" fill="${PALETTE.ink}" letter-spacing="0.08em">EVIDENCE MAP</text>`,
    `<text x="24" y="56" font-size="12" fill="${PALETTE.ink2}">Sources merged by shared PMID / NCT / DOI. Line colour = direction relative to the hypothesis.</text>`,
    legend(L.width - 360, 30),
  );
  const h = L.hypothesis;
  // Edges: hypothesis → findings
  for (const n of L.findings) {
    const color = DIRECTION_COLOR[n.finding.direction];
    const fromLeft = n.x + n.w < h.x;
    const fromRight = n.x > h.x + h.w;
    const d = fromLeft
      ? curve(n.x + n.w, n.y + n.h / 2, h.x, h.y + h.h / 2)
      : fromRight
        ? curve(h.x + h.w, h.y + h.h / 2, n.x, n.y + n.h / 2)
        : `M${h.x + h.w / 2},${h.y + h.h} L${n.x + n.w / 2},${n.y}`;
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" opacity="0.55" data-finding="${n.id}"/>`);
  }
  // Edges: findings → source groups
  for (const g of L.groups) {
    for (const fid of g.group.findingIds) {
      const n = L.findings.find((x) => x.id === fid);
      if (!n) continue;
      const color = DIRECTION_COLOR[n.finding.direction];
      const d = g.group.side === "left" ? curve(g.x + g.w, g.y + g.h / 2, n.x, n.y + n.h / 2) : curve(n.x + n.w, n.y + n.h / 2, g.x, g.y + g.h / 2);
      parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1" stroke-dasharray="3 3" opacity="0.7" data-finding="${fid}" data-group="${esc(g.id)}"/>`);
    }
  }
  // Hypothesis node
  const assessColor = brief.assessment === "supported" ? PALETTE.teal : brief.assessment === "opposed" ? PALETTE.focus : PALETTE.slate;
  parts.push(
    `<g data-node="hypothesis"><rect x="${h.x}" y="${h.y}" width="${h.w}" height="${h.h}" rx="14" fill="${PALETTE.paper}" stroke="${PALETTE.ink}" stroke-width="1.2"/>`,
    `<text x="${h.x + 16}" y="${h.y + 22}" font-size="10" letter-spacing="0.1em" fill="${PALETTE.ink2}">HYPOTHESIS</text>`,
    textLines(wrap(brief.title, 30, 2), h.x + 16, h.y + 42, 16, `font-size="13" font-weight="600" fill="${PALETTE.ink}"`),
    `<text x="${h.x + 16}" y="${h.y + h.h - 12}" font-size="11" font-weight="600" fill="${assessColor}">${esc(brief.assessment.toUpperCase())}</text></g>`,
  );
  // Finding cards
  for (const n of L.findings) {
    const f = n.finding;
    const color = DIRECTION_COLOR[f.direction];
    parts.push(
      `<g data-finding="${f.id}" tabindex="0"><title>${esc(`${f.id} (${f.direction}, ${f.kind}): ${f.claim}`)}</title>`,
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${PALETTE.paper}" stroke="${color}" stroke-width="1.2"/>`,
      `<rect x="${n.x}" y="${n.y + 10}" width="3" height="${n.h - 20}" rx="1.5" fill="${color}"/>`,
      `<text x="${n.x + 14}" y="${n.y + 19}" font-size="10" font-weight="600" fill="${color}" letter-spacing="0.06em">${esc(`${f.id} · ${f.direction.toUpperCase()} · ${f.kind}`)}</text>`,
      textLines(wrap(f.claim, 40, 3), n.x + 14, n.y + 35, 13, `font-size="11" fill="${PALETTE.ink}"`),
      `</g>`,
    );
  }
  // Source groups
  for (const g of L.groups) {
    parts.push(
      `<g data-group="${esc(g.id)}"><title>${esc(g.group.sourceIds.join(", "))}</title>`,
      `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${g.h / 2}" fill="${PALETTE.paper}" stroke="${PALETTE.line}" stroke-width="1"/>`,
      `<text x="${g.x + 14}" y="${g.y + 19}" font-size="11" font-weight="600" fill="${PALETTE.ink}">${esc(wrap(g.group.label, 26, 1)[0] ?? "")}</text>`,
      `<text x="${g.x + 14}" y="${g.y + 34}" font-size="10" fill="${PALETTE.ink2}">${esc(wrap(g.group.sub, 30, 1)[0] ?? "")}</text>`,
      `</g>`,
    );
  }
  parts.push(`</svg>`);
  return parts.join("");
}

function legend(x: number, y: number) {
  const items: [string, string][] = [
    ["Supports", DIRECTION_COLOR.supports],
    ["Opposes", DIRECTION_COLOR.opposes],
    ["Context", DIRECTION_COLOR.context],
  ];
  return items
    .map(([label, color], i) => `<g transform="translate(${x + i * 110},${y})"><line x1="0" y1="0" x2="22" y2="0" stroke="${color}" stroke-width="2"/><text x="30" y="4" font-size="11" fill="${PALETTE.ink2}">${label}</text></g>`)
    .join("");
}
