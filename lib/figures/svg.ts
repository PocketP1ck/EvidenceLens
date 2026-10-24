export const PALETTE = {
  sky: "#8FD9FB",
  teal: "#4AB5B5",
  slate: "#6D8BC0",
  focus: "#525AFF",
  ink: "#141A26",
  ink2: "#4A5468",
  line: "#E3E8F0",
  paper: "#FFFFFF",
  mute: "#A7B0C0",
};

export const DIRECTION_COLOR: Record<string, string> = {
  supports: PALETTE.teal,
  opposes: PALETTE.focus,
  context: PALETTE.slate,
  mixed: PALETTE.ink2,
  none: PALETTE.mute,
};

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Greedy word wrap by character budget; the last line is ellipsized if needed. */
export function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  const used = lines.join(" ").length;
  if (used < text.replace(/\s+/g, " ").trim().length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = (last.length > maxChars - 1 ? last.slice(0, maxChars - 1) : last).replace(/[\s,.;:]+$/, "") + "…";
  }
  return lines.map((l) => (l.length > maxChars ? l.slice(0, maxChars - 1) + "…" : l));
}

export function textLines(lines: string[], x: number, y: number, lh: number, attrs: string): string {
  return lines.map((l, i) => `<text x="${x}" y="${y + i * lh}" ${attrs}>${esc(l)}</text>`).join("");
}

export const FONT = `font-family="ui-sans-serif, -apple-system, 'Helvetica Neue', Arial, sans-serif"`;
