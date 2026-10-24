import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Brief, EvidenceFile, NewRunEvent, RunEvent, RunMeta, SourcesFile } from "./types";

const RUN_ID_RE = /^[a-z0-9][a-z0-9-]{2,90}$/;
const FILE_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

export function isSafeRunId(id: string): boolean {
  return RUN_ID_RE.test(id);
}

export function isSafeFileName(name: string): boolean {
  return FILE_RE.test(name) && !name.includes("..");
}

export function makeRunId(goal: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const slug = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter((w) => w.length > 1 && !["the", "of", "in", "for", "and", "a", "an", "to", "does", "is", "inhibition", "whether"].includes(w))
    .slice(0, 5)
    .join("-");
  return `${date}-${slug || "investigation"}-${crypto.randomBytes(2).toString("hex")}`;
}

/** One investigation folder: investigations/<run-id>/ */
export class RunStore {
  private seq = 0;
  readonly dir: string;

  constructor(
    readonly root: string,
    readonly id: string,
  ) {
    if (!isSafeRunId(id)) throw new Error(`Unsafe run id: ${id}`);
    this.dir = path.join(root, id);
  }

  static async create(root: string, id: string): Promise<RunStore> {
    const store = new RunStore(root, id);
    await fs.mkdir(path.join(store.dir, "figures"), { recursive: true });
    await fs.mkdir(path.join(store.dir, "structures"), { recursive: true });
    return store;
  }

  async writeJson(name: "run.json" | "evidence.json" | "sources.json" | "brief.json", data: unknown) {
    const file = path.join(this.dir, name);
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
  }

  async writeText(name: "brief.md", text: string) {
    await fs.writeFile(path.join(this.dir, name), text);
  }

  /** Append-only event log; the SSE route tails this file. */
  async appendEvent(e: NewRunEvent): Promise<RunEvent> {
    const event = { ...e, seq: ++this.seq, at: new Date().toISOString() } as RunEvent;
    await fs.appendFile(path.join(this.dir, "events.jsonl"), JSON.stringify(event) + "\n");
    return event;
  }

  async saveFile(sub: "figures" | "structures", name: string, content: string | Buffer) {
    if (!isSafeFileName(name)) throw new Error(`Unsafe file name: ${name}`);
    const file = path.join(this.dir, sub, name);
    await fs.writeFile(file, content);
    return path.relative(this.dir, file);
  }
}

export async function readEvents(root: string, id: string): Promise<RunEvent[]> {
  if (!isSafeRunId(id)) return [];
  try {
    const raw = await fs.readFile(path.join(root, id, "events.jsonl"), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RunEvent);
  } catch {
    return [];
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export interface Investigation {
  run: RunMeta;
  brief: Brief | null;
  evidence: EvidenceFile | null;
  sources: SourcesFile | null;
  figures: string[];
  structures: string[];
}

export async function loadInvestigation(root: string, id: string): Promise<Investigation | null> {
  if (!isSafeRunId(id)) return null;
  const dir = path.join(root, id);
  const run = await readJson<RunMeta>(path.join(dir, "run.json"));
  if (!run) return null;
  const list = async (sub: string) => (await fs.readdir(path.join(dir, sub)).catch(() => [])).filter((f) => !f.startsWith("."));
  return {
    run,
    brief: await readJson<Brief>(path.join(dir, "brief.json")),
    evidence: await readJson<EvidenceFile>(path.join(dir, "evidence.json")),
    sources: await readJson<SourcesFile>(path.join(dir, "sources.json")),
    figures: await list("figures"),
    structures: await list("structures"),
  };
}

export interface InvestigationSummary {
  id: string;
  title: string;
  goal: string;
  status: RunMeta["status"];
  assessment?: RunMeta["assessment"];
  createdAt: string;
  usd: number;
  model: string;
  findings: number;
  sources: number;
}

export async function listInvestigations(root: string): Promise<InvestigationSummary[]> {
  if (!fsSync.existsSync(root)) return [];
  const dirs = (await fs.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory() && isSafeRunId(d.name));
  const out: InvestigationSummary[] = [];
  for (const d of dirs) {
    const run = await readJson<RunMeta>(path.join(root, d.name, "run.json"));
    if (!run) continue;
    const ev = await readJson<EvidenceFile>(path.join(root, d.name, "evidence.json"));
    const src = await readJson<SourcesFile>(path.join(root, d.name, "sources.json"));
    out.push({
      id: run.id,
      title: run.title ?? run.goal,
      goal: run.goal,
      status: run.status,
      assessment: run.assessment,
      createdAt: run.createdAt,
      usd: run.usage.usd,
      model: run.model,
      findings: ev?.findings.length ?? 0,
      sources: src?.sources.length ?? 0,
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Resolve a file inside a run folder, refusing traversal. */
export function resolveRunFile(root: string, id: string, sub: string, name: string): string | null {
  if (!isSafeRunId(id) || !["figures", "structures"].includes(sub) || !isSafeFileName(name)) return null;
  const file = path.join(root, id, sub, name);
  return file.startsWith(path.join(root, id) + path.sep) ? file : null;
}
