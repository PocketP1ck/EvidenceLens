import { NextResponse } from "next/server";
import { INVESTIGATIONS_DIR } from "@/lib/config";
import { loadInvestigation } from "@/lib/harness/store";
import { stopRun } from "@/lib/harness/runner";
import { isLocalRequest } from "@/lib/http-guard";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await loadInvestigation(INVESTIGATIONS_DIR, id);
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(inv);
}

/** Stop a running investigation. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  return NextResponse.json({ stopped: stopRun(id) });
}
