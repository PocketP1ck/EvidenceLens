import { NextResponse } from "next/server";
import { z } from "zod";
import { INVESTIGATIONS_DIR, resolveModel } from "@/lib/config";
import { listInvestigations } from "@/lib/harness/store";
import { activeRunId, RunConflictError, startRun } from "@/lib/harness/runner";
import { BudgetExceededError } from "@/lib/harness/budget";
import { isLocalRequest } from "@/lib/http-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ investigations: await listInvestigations(INVESTIGATIONS_DIR), active: activeRunId() });
}

const StartSchema = z.object({
  goal: z.string().trim().min(10, "Describe the research goal in a sentence.").max(400),
  target: z.string().trim().max(60).optional(),
  disease: z.string().trim().max(80).optional(),
  compound: z.string().trim().max(60).optional(),
  model: z.enum(["sonnet", "haiku"]).optional(),
});

export async function POST(req: Request) {
  if (!isLocalRequest(req)) return NextResponse.json({ error: "Runs can only be started from this machine." }, { status: 403 });
  const parsed = StartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const { goal, target, disease, compound, model } = parsed.data;
  try {
    const id = await startRun({ goal, context: { target: target || undefined, disease: disease || undefined, compound: compound || undefined }, model: resolveModel(model) });
    return NextResponse.json({ id }, { status: 202 });
  } catch (err) {
    if (err instanceof RunConflictError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof BudgetExceededError) return NextResponse.json({ error: err.message }, { status: 402 });
    return NextResponse.json({ error: "Could not start the investigation." }, { status: 500 });
  }
}
