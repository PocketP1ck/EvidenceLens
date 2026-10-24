import { Otter } from "@/components/Otter";
import type { OtterPose } from "@/lib/stage";

const POSES: OtterPose[] = ["idle", "planning", "searching", "reading", "comparing", "writing", "finished", "stopped"];

export default function OtterSheet() {
  return (
    <main style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, padding: 30 }}>
      {POSES.map((p) => (
        <figure key={p} style={{ margin: 0, textAlign: "center" }}>
          <Otter pose={p} size={300} />
          <figcaption>{p}</figcaption>
        </figure>
      ))}
    </main>
  );
}
