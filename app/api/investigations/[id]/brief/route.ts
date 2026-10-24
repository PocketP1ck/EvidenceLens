import fs from "node:fs/promises";
import path from "node:path";
import { INVESTIGATIONS_DIR } from "@/lib/config";
import { isSafeRunId } from "@/lib/harness/store";

export const dynamic = "force-dynamic";

/** Download the rendered brief.md. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSafeRunId(id)) return new Response("Not found", { status: 404 });
  try {
    const md = await fs.readFile(path.join(INVESTIGATIONS_DIR, id, "brief.md"), "utf8");
    return new Response(md, {
      headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${id}-brief.md"` },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
