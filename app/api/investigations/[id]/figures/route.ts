import { NextResponse } from "next/server";
import { INVESTIGATIONS_DIR } from "@/lib/config";
import { isSafeRunId, RunStore } from "@/lib/harness/store";
import { isLocalRequest } from "@/lib/http-guard";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

/** Save the browser-rendered 3D structure figure as figures/structure.png. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!isSafeRunId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { dataUrl?: string } | null;
  const m = body?.dataUrl?.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return NextResponse.json({ error: "Expected a PNG data URL" }, { status: 400 });
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > MAX_BYTES || buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    return NextResponse.json({ error: "Invalid PNG" }, { status: 400 });
  }
  const store = new RunStore(INVESTIGATIONS_DIR, id);
  const rel = await store.saveFile("figures", "structure.png", buf);
  return NextResponse.json({ saved: rel, bytes: buf.length });
}
