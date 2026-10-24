import type { OtterPose } from "@/lib/stage";

/**
 * Minimal contour otter. One base drawing plus a prop layer per stage.
 * The pose is driven only by the harness stage of the tool currently executing.
 * Motion is CSS-only and disabled under prefers-reduced-motion (see globals.css).
 */
export function Otter({ pose, size = 300 }: { pose: OtterPose; size?: number }) {
  const on = (p: OtterPose | OtterPose[]) => ((Array.isArray(p) ? p : [p]).includes(pose) ? "otter-layer on" : "otter-layer");
  const working = !["idle", "finished", "stopped"].includes(pose);
  return (
    <svg
      className={`otter pose-${pose}${working ? " working" : ""}`}
      viewBox="0 0 260 220"
      width={size}
      height={(size * 220) / 260}
      role="img"
      aria-label={`Otter mascot, ${pose}`}
      data-pose={pose}
    >
      {/* ground line */}
      <path d="M20 192 H240" className="o-ground" />

      {/* ---- props behind the otter ---- */}
      <g className={on("finished")} data-layer="finished">
        <g className="o-stack">
          <rect x="14" y="164" width="52" height="26" rx="3" className="o-paper" />
          <rect x="17" y="156" width="52" height="26" rx="3" className="o-paper" />
          <rect x="20" y="148" width="52" height="26" rx="3" className="o-paper" />
          <path d="M28 158 H60 M28 165 H52" className="o-ink-line" />
        </g>
        <circle cx="46" cy="128" r="10" className="o-check-ring" />
        <path d="M41 128.5 L45 132.5 L51.5 124.5" className="o-check" pathLength={1} />
      </g>

      <g className={on("writing")} data-layer="writing">
        <rect x="164" y="118" width="44" height="58" rx="3" className="o-paper" />
        <path d="M172 132 H200" className="o-write-line l1" pathLength={1} />
        <path d="M172 141 H196" className="o-write-line l2" pathLength={1} />
        <path d="M172 150 H200" className="o-write-line l3" pathLength={1} />
        <path d="M172 159 H190" className="o-write-line l4" pathLength={1} />
      </g>

      {/* ---- tail and body ---- */}
      <path
        d="M154 170 C178 178 204 170 212 150 C215 142 207 138 202 145 C194 160 176 166 156 160"
        className="o-body o-tail"
      />
      <g className="o-breath">
        <path d="M100 84 C86 98 80 126 84 152 C87 172 102 184 120 184 C138 184 153 172 156 152 C160 126 154 98 140 84 Z" className="o-body o-fill" />
        <path d="M108 104 C101 124 104 150 120 166 C136 150 139 124 132 104 C126 100 114 100 108 104 Z" className="o-belly" />
        <path d="M98 182 C94 190 108 192 112 185" className="o-body" />
        <path d="M128 185 C132 192 146 190 142 182" className="o-body" />
      </g>

      {/* ---- arms per pose ---- */}
      <g className={on(["idle", "planning", "stopped", "finished"])} data-layer="arms-rest">
        <path d="M98 104 C100 116 110 122 117 121" className="o-body" />
        <path d="M142 104 C140 116 130 122 123 121" className="o-body" />
        <circle cx="117.5" cy="121" r="3.2" className="o-paw" />
        <circle cx="122.5" cy="121" r="3.2" className="o-paw" />
      </g>

      <g className={on("planning")} data-layer="planning">
        <g className="o-plan">
          <circle cx="40" cy="58" r="2.6" className="o-dot d1" />
          <path d="M48 58 H76" className="o-plan-line d1" pathLength={1} />
          <circle cx="40" cy="72" r="2.6" className="o-dot d2" />
          <path d="M48 72 H70" className="o-plan-line d2" pathLength={1} />
          <circle cx="40" cy="86" r="2.6" className="o-dot d3" />
          <path d="M48 86 H74" className="o-plan-line d3" pathLength={1} />
        </g>
      </g>

      <g className={on("searching")} data-layer="searching">
        <path d="M98 104 C100 118 108 126 114 128" className="o-body" />
        <path d="M142 104 C150 112 162 114 172 110" className="o-body" />
        <circle cx="175" cy="109" r="3.4" className="o-paw" />
        <path d="M182 108 C200 104 218 98 246 92" className="o-search-line" pathLength={1} />
        <circle cx="246" cy="92" r="3" className="o-search-tip" />
      </g>

      <g className={on("reading")} data-layer="reading">
        <rect x="102" y="102" width="36" height="46" rx="3" className="o-paper" />
        <path d="M109 113 H131 M109 120 H128 M109 127 H131 M109 134 H125" className="o-ink-line" />
        <rect x="107" y="110" width="26" height="5" rx="2" className="o-read-mark" />
        <path d="M98 104 C97 116 99 126 103 129" className="o-body" />
        <path d="M142 104 C143 116 141 126 137 129" className="o-body" />
        <circle cx="103.5" cy="130" r="3.2" className="o-paw" />
        <circle cx="136.5" cy="130" r="3.2" className="o-paw" />
      </g>

      <g className={on("comparing")} data-layer="comparing">
        <rect x="46" y="104" width="28" height="34" rx="3" className="o-paper o-cmp-a" />
        <path d="M52 114 H68 M52 121 H64 M52 128 H68" className="o-ink-line" />
        <rect x="166" y="98" width="28" height="34" rx="3" className="o-paper o-cmp-b" />
        <path d="M172 108 H188 M172 115 H184 M172 122 H188" className="o-ink-line" />
        <path d="M98 104 C90 112 84 118 77 121" className="o-body" />
        <path d="M142 104 C150 110 157 114 163 116" className="o-body" />
        <circle cx="75" cy="122" r="3.2" className="o-paw" />
        <circle cx="165" cy="116" r="3.2" className="o-paw" />
      </g>

      <g className={on("writing")} data-layer="writing-arm">
        <path d="M98 104 C100 116 110 122 117 121" className="o-body" />
        <circle cx="117.5" cy="121" r="3.2" className="o-paw" />
        <path d="M142 104 C150 116 158 126 166 134" className="o-body" />
        <circle cx="168" cy="136" r="3.2" className="o-paw" />
      </g>

      {/* ---- head (drawn last, white fill covers the body top) ---- */}
      <g className="o-head">
        <path d="M97 50 C93 44 97 39 102 41" className="o-body" />
        <path d="M138 41 C143 39 147 44 143 50" className="o-body" />
        <path d="M94 66 C92 48 104 38 120 38 C136 38 148 48 146 66 C145 80 134 88 120 88 C106 88 95 80 94 66 Z" className="o-body o-fill" />
        <g className="o-eyes">
          <g className="o-eyes-open">
            <circle cx="110" cy="62" r="2.6" className="o-eye" />
            <circle cx="130" cy="62" r="2.6" className="o-eye" />
          </g>
          <g className="o-eyes-closed">
            <path d="M106 62 Q110 65.5 114 62" className="o-lid" />
            <path d="M126 62 Q130 65.5 134 62" className="o-lid" />
          </g>
        </g>
        <ellipse cx="120" cy="72" rx="10" ry="7" className="o-muzzle" />
        <path d="M116.5 68 Q120 66.5 123.5 68 Q122 71.5 120 72 Q118 71.5 116.5 68 Z" className="o-nose" />
        <path d="M120 72 V75 M120 75 Q117 77.5 115 76 M120 75 Q123 77.5 125 76" className="o-mouth" />
        <path d="M109 72 L96 70 M109 75 L97 77 M131 72 L144 70 M131 75 L143 77" className="o-whisker" />
      </g>
    </svg>
  );
}
