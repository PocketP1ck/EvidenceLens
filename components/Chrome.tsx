import Link from "next/link";

export function LensMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="#525AFF" strokeWidth="1.8" />
      <circle cx="10" cy="10" r="3.2" fill="none" stroke="#8FD9FB" strokeWidth="1.6" />
      <path d="M15.2 15.2 L21 21" stroke="#4AB5B5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar({ note }: { note?: string }) {
  return (
    <header className="topbar">
      <Link href="/" className="wordmark" aria-label="EvidenceLens home">
        <LensMark />
        EvidenceLens
      </Link>
      <span className="topbar-note">{note ?? "Independent research agent"}</span>
    </header>
  );
}

export function FolderGlyph() {
  return (
    <svg width="28" height="24" viewBox="0 0 28 24" aria-hidden="true">
      <path d="M2 5.5 C2 4.1 3.1 3 4.5 3 H10 L12.5 6 H23.5 C24.9 6 26 7.1 26 8.5 V19.5 C26 20.9 24.9 22 23.5 22 H4.5 C3.1 22 2 20.9 2 19.5 Z" fill="none" stroke="#6D8BC0" strokeWidth="1.4" />
      <path d="M2 10 H26" stroke="#8FD9FB" strokeWidth="1.2" />
    </svg>
  );
}

export const ASSESSMENT_TEXT: Record<string, string> = {
  supported: "Supported",
  opposed: "Opposed",
  mixed: "Mixed",
  insufficient: "Insufficient",
};
