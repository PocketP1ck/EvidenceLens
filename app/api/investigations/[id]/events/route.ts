import { INVESTIGATIONS_DIR } from "@/lib/config";
import { isSafeRunId, readEvents } from "@/lib/harness/store";
import { replayDelays } from "@/lib/replay";
import type { RunEvent } from "@/lib/harness/types";

export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Server-sent events for one investigation.
 * Live mode tails events.jsonl until the run finishes. Replay mode (?replay=1&speed=N)
 * re-emits a saved run with scaled timing and makes no API calls.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSafeRunId(id)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const replay = url.searchParams.get("replay") === "1";
  const speed = Number(url.searchParams.get("speed") ?? 1) || 1;
  const encoder = new TextEncoder();
  const signal = req.signal;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: RunEvent | { type: "replay_end" }) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        if (replay) {
          const events = await readEvents(INVESTIGATIONS_DIR, id);
          const delays = replayDelays(events, speed);
          for (let i = 0; i < events.length && !signal.aborted; i++) {
            if (delays[i]) await sleep(delays[i]);
            send(events[i]);
          }
          send({ type: "replay_end" });
        } else {
          let sent = 0;
          const started = Date.now();
          while (!signal.aborted && Date.now() - started < 20 * 60 * 1000) {
            const events = await readEvents(INVESTIGATIONS_DIR, id);
            for (; sent < events.length; sent++) send(events[sent]);
            if (events.some((e) => e.type === "finished")) break;
            controller.enqueue(encoder.encode(`: keep-alive\n\n`));
            await sleep(400);
          }
        }
      } catch {
        /* client went away */
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
