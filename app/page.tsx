import { INVESTIGATIONS_DIR } from "@/lib/config";
import { listInvestigations, loadInvestigation } from "@/lib/harness/store";
import { TopBar } from "@/components/Chrome";
import { Workspace, type WorkspaceProps } from "@/components/Workspace";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const items = await listInvestigations(INVESTIGATIONS_DIR);
  let replay: WorkspaceProps["replay"] = null;
  if (sp.replay) {
    const inv = await loadInvestigation(INVESTIGATIONS_DIR, sp.replay);
    if (inv) replay = { id: inv.run.id, goal: inv.run.goal, ...inv.run.context, speed: Number(sp.speed ?? 3) || 3 };
  }
  // In replay mode, hide the replayed run from the list until it "finishes" on screen.
  const visible = replay ? items.filter((i) => i.id !== replay!.id) : items;
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <main className="shell">
        <TopBar />
        <Workspace initial={visible} replay={replay} model={sp.model === "haiku" ? "haiku" : undefined} />
      </main>
    </>
  );
}
