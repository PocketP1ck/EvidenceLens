import Link from "next/link";
import type { InvestigationSummary } from "@/lib/harness/store";
import { ASSESSMENT_TEXT, FolderGlyph } from "./Chrome";

export function InvestigationList({ items }: { items: InvestigationSummary[] }) {
  return (
    <section className="section" aria-labelledby="inv-title">
      <div className="section-head">
        <h2 id="inv-title">Investigations</h2>
        <span className="hint">Each one is a folder of brief, evidence, sources and figures.</span>
      </div>
      {items.length === 0 ? (
        <p className="empty">No investigations yet. Completed research will appear here.</p>
      ) : (
        <ul className="folders">
          {items.map((it) => (
            <li key={it.id}>
              <Link href={`/investigations/${it.id}`} className="folder">
                <FolderGlyph />
                <span style={{ minWidth: 0 }}>
                  <span className="folder-title" style={{ display: "block" }}>
                    {it.title}
                  </span>
                  <span className="folder-path">investigations/{it.id}/</span>
                </span>
                {it.status === "completed" && it.assessment ? (
                  <span className={`pill ${it.assessment}`}>{ASSESSMENT_TEXT[it.assessment]}</span>
                ) : (
                  <span className={`pill ${it.status}`}>{it.status}</span>
                )}
                <span className="folder-meta">
                  {new Date(it.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {it.findings} findings · {it.sources} sources
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
