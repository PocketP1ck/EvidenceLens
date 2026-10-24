import fs from "node:fs";
import path from "node:path";
import { setFetcher } from "./http";

export function fixture<T = unknown>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "fixtures", name), "utf8")) as T;
}

/** Route fetch calls to fixture payloads by URL substring. Unmatched URLs fail loudly. */
export function mockFetch(routes: [match: string | RegExp, body: unknown, status?: number][]) {
  const calls: string[] = [];
  setFetcher((async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const full = init?.body ? `${url} ${String(init.body)}` : url;
    calls.push(full);
    const route = routes.find(([m]) => (typeof m === "string" ? full.includes(m) : m.test(full)));
    if (!route) return new Response(`no fixture for ${url}`, { status: 599 });
    const [, body, status = 200] = route;
    if (status === 204) return new Response(null, { status: 204 });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch);
  return calls;
}

export function resetFetch() {
  setFetcher(null);
}
