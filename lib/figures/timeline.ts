import type { SourceRecord } from "@/lib/adapters/types";
import type { TrialData } from "@/lib/adapters/clinicaltrials";
import type { EvidenceFile } from "@/lib/harness/types";
import { DIRECTION_COLOR, esc, FONT, PALETTE, wrap } from "./svg";
import { shortId } from "./evidence-map";

export interface TimelineItem {
  sourceId: string;
  kind: "trial" | "publication";
  label: string;
  title: string;
  start: number;
  end: number;
  detail: string;
  direction: "supports" | "opposes" | "context" | "mixed" | "none";
}

function fracYear(date?: string): number | null {
  if (!date) return null;
  const [y, m] = date.split("-").map(Number);
  if (!Number.isFinite(y)) return null;
  return y + ((Number.isFinite(m) ? m : 6) - 1) / 12;
}

/** Trials and publications cited by findings, with direction taken from those findings. */
export function timelineItems(evidence: EvidenceFile, sources: SourceRecord[]): TimelineItem[] {
  const dir = new Map<string, Set<string>>();
  for (const f of evidence.findings) for (const s of f.sourceIds) dir.set(s, (dir.get(s) ?? new Set()).add(f.direction));
  const cited = sources.filter((s) => dir.has(s.id) && (s.kind === "trial" || s.kind === "publication"));
  const pool = cited.length ? cited : sources.filter((s) => s.kind === "trial");
  const items: TimelineItem[] = [];
  for (const s of pool) {
    const ds = [...(dir.get(s.id) ?? [])];
    const direction = (ds.length === 0 ? "none" : ds.length > 1 ? "mixed" : ds[0]) as TimelineItem["direction"];
    if (s.kind === "trial") {
      const d = s.data as unknown as TrialData;
      const start = fracYear(d.startDate) ?? s.year;
      if (!start) continue;
      const end = fracYear(d.completionDate) ?? start + 0.25;
      items.push({
        sourceId: s.id,
        kind: "trial",
        label: d.nctId,
        title: s.title,
        start,
        end: Math.max(end, start + 0.15),
        detail: [d.phases.join("/") || "NA", d.allocation === "RANDOMIZED" ? "randomized" : "non-randomized", `n=${d.enrollment ?? "?"}`, (d.status ?? "").toLowerCase().replace(/_/g, " "), d.hasResults ? "results posted" : "no results posted"].join(" · "),
        direction,
      });
    } else if (s.year) {
      const pubTypes = ((s.data as { pubTypes?: string[] }).pubTypes ?? []).filter((t) => !/journal article/i.test(t)).slice(0, 2);
      items.push({
        sourceId: s.id,
        kind: "publication",
        label: shortId(s.id),
        title: s.title,
        start: s.year + 0.5,
        end: s.year + 0.5,
        detail: [String(s.year), ...pubTypes, (s.data as { journal?: string }).journal].filter(Boolean).join(" · "),
        direction,
      });
    }
  }
  return items.sort((a, b) => a.start - b.start).slice(0, 14);
}

export function timelineSvg(evidence: EvidenceFile, sources: SourceRecord[]): string {
  const items = timelineItems(evidence, sources);
  const W = 1000;
  const ROW = 50;
  const top = 92;
  const x0 = 380;
  const x1 = W - 40;
  const H = top + Math.max(items.length, 1) * ROW + 56;
  const minY = Math.floor(Math.min(...items.map((i) => i.start), new Date().getFullYear()) - 0.5);
  const maxY = Math.ceil(Math.max(...items.map((i) => i.end), minY + 2) + 0.5);
  const sx = (y: number) => x0 + ((y - minY) / (maxY - minY)) * (x1 - x0);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="tl-title tl-desc" ${FONT}>`,
    `<title id="tl-title">Study timeline</title>`,
    `<desc id="tl-desc">${items.length} trials and publications cited by findings, positioned by date and coloured by direction.</desc>`,
    `<rect width="100%" height="100%" fill="${PALETTE.paper}"/>`,
    `<text x="24" y="36" font-size="13" font-weight="600" fill="${PALETTE.ink}" letter-spacing="0.08em">STUDY TIMELINE</text>`,
    `<text x="24" y="56" font-size="12" fill="${PALETTE.ink2}">Bars: trial start → completion (ClinicalTrials.gov). Diamonds: publication year. Colour = direction of findings citing it.</text>`,
  ];
  if (!items.length) {
    parts.push(`<text x="24" y="${top + 20}" font-size="12" fill="${PALETTE.ink2}">No dated trials or publications were cited.</text></svg>`);
    return parts.join("");
  }
  const step = maxY - minY > 16 ? 4 : maxY - minY > 8 ? 2 : 1;
  for (let y = minY; y <= maxY; y += step) {
    const x = sx(y);
    parts.push(`<line x1="${x}" y1="${top - 14}" x2="${x}" y2="${H - 40}" stroke="${PALETTE.line}" stroke-width="1"/>`, `<text x="${x}" y="${H - 22}" font-size="10" fill="${PALETTE.ink2}" text-anchor="middle">${y}</text>`);
  }
  items.forEach((it, i) => {
    const y = top + i * ROW;
    const color = DIRECTION_COLOR[it.direction];
    parts.push(
      `<g data-source="${esc(it.sourceId)}"><title>${esc(`${it.label}: ${it.title}`)}</title>`,
      `<text x="24" y="${y + 6}" font-size="12" font-weight="600" fill="${PALETTE.ink}">${esc(it.label)}<tspan font-weight="400" fill="${color}" font-size="10" dx="8">${esc(it.direction === "none" ? "" : it.direction.toUpperCase())}</tspan></text>`,
      `<text x="24" y="${y + 22}" font-size="10.5" fill="${PALETTE.ink2}">${esc(wrap(it.detail, 58, 1)[0] ?? "")}</text>`,
      `<line x1="${x0}" y1="${y + 2}" x2="${x1}" y2="${y + 2}" stroke="${PALETTE.line}" stroke-width="0.6" stroke-dasharray="2 4"/>`,
    );
    if (it.kind === "trial") {
      const a = sx(it.start);
      const b = Math.max(sx(it.end), a + 6);
      parts.push(`<rect x="${a}" y="${y - 5}" width="${b - a}" height="14" rx="7" fill="${color}" opacity="0.18"/><rect x="${a}" y="${y - 5}" width="${b - a}" height="14" rx="7" fill="none" stroke="${color}" stroke-width="1.2"/>`);
    } else {
      const x = sx(it.start);
      parts.push(`<path d="M${x},${y - 7} L${x + 8},${y + 2} L${x},${y + 11} L${x - 8},${y + 2} Z" fill="${PALETTE.paper}" stroke="${color}" stroke-width="1.4"/>`);
    }
    parts.push(`</g>`);
  });
  parts.push(`</svg>`);
  return parts.join("");
}
