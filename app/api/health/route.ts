import { NextResponse } from "next/server";
import { LIMITS, MODELS, SPEND_FILE } from "@/lib/config";
import { getAnthropic } from "@/lib/harness/anthropic";
import { costFromUsage, SpendLedger } from "@/lib/harness/budget";

export const dynamic = "force-dynamic";

/** Dev-only smoke test: one tiny Haiku request, cost recorded in the spend ledger. */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const ledger = new SpendLedger(SPEND_FILE, LIMITS.globalCapUsd);
  try {
    await ledger.assertCanSpend();
    const res = await getAnthropic().messages.create({
      model: MODELS.haiku,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
    });
    const usd = costFromUsage(MODELS.haiku, res.usage);
    const total = await ledger.record("health", MODELS.haiku, usd);
    const text = res.content.find((b) => b.type === "text");
    return NextResponse.json({
      model: res.model,
      reply: text && text.type === "text" ? text.text.trim() : null,
      costUsd: usd,
      totalSpentUsd: total,
      capUsd: LIMITS.globalCapUsd,
    });
  } catch (err) {
    // Never echo request headers or configuration; the message alone is safe.
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
