import { AdapterError, type SourceName } from "./types";

const USER_AGENT = "EvidenceLens/0.1 (hackathon research prototype; public API client)";

export interface FetchOptions {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  accept?: string;
}

export type Fetcher = typeof fetch;

let fetcher: Fetcher = (...args) => fetch(...args);

/** Swap the network layer in tests. */
export function setFetcher(f: Fetcher | null) {
  fetcher = f ?? ((...args) => fetch(...args));
}

/**
 * JSON fetch with timeout, bounded retries on 429/5xx/network errors, and a descriptive User-Agent.
 * Returns `null` for 204 No Content (RCSB search uses it for "no hits").
 */
export async function fetchJson<T>(source: SourceName, url: string, opts: FetchOptions = {}): Promise<T | null> {
  const { method = "GET", body, timeoutMs = 25_000, retries = 2, accept = "application/json" } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetcher(url, {
        method,
        signal: ctrl.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (res.status === 204) return null;
      if (res.status === 404) throw new AdapterError(source, `not found (${url})`, 404);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new AdapterError(source, `HTTP ${res.status}`, res.status);
      } else if (!res.ok) {
        throw new AdapterError(source, `HTTP ${res.status}`, res.status);
      } else {
        const text = await res.text();
        if (!text.trim()) return null;
        return JSON.parse(text) as T;
      }
    } catch (err) {
      if (err instanceof AdapterError && err.status && err.status < 500 && err.status !== 429) throw err;
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
  }
  const msg = lastErr instanceof Error ? (lastErr.name === "AbortError" ? "request timed out" : lastErr.message) : "request failed";
  throw lastErr instanceof AdapterError ? lastErr : new AdapterError(source, msg);
}

/** Download a binary/text file (structure models). */
export async function fetchText(source: SourceName, url: string, timeoutMs = 40_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { signal: ctrl.signal, headers: { "user-agent": USER_AGENT } });
    if (!res.ok) throw new AdapterError(source, `HTTP ${res.status} downloading ${url}`, res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function nowIso() {
  return new Date().toISOString();
}
