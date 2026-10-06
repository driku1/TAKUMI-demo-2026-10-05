import { useId } from "react";
import type { Expert } from "./data";

/*
 * Illustrated portraits of the (fictional) experts, shown only in the Expert
 * Matching candidate panel — never inside a knowledge graph. Generated from
 * the expert's id, category and years (hair, skin tone, glasses and work
 * clothes vary) as flat vector drawings, deliberately not photographic.
 */

type Look = {
  skin: string;
  hair: string;
  style: number;
  glasses: boolean;
  wear: string;
  background: string;
};

const skins = ["#f6d9c2", "#efc9a8", "#e3b691", "#d3a07c"];
const hairs = ["#2a2422", "#3b2d26", "#4d3b30", "#1f1e24", "#5e4a3d"];
const byCategory: Record<string, { wear: string; background: string }> = {
  切削加工: { wear: "#36597a", background: "#dbe7f3" },
  "材料・接合": { wear: "#3f6b5c", background: "#dcece5" },
  "金型・成形": { wear: "#5a4a8c", background: "#e6e0f5" },
  "品質・計測": { wear: "#2f6f86", background: "#d9eef3" },
  "自動化・保全": { wear: "#6b5a3c", background: "#efe7d8" },
  "生産・組立": { wear: "#7a4a5f", background: "#f2e1e8" },
};

export function lookFor(expert: Pick<Expert, "id" | "category" | "years">): Look {
  const palette = byCategory[expert.category] ?? { wear: "#4a4458", background: "#ebe8f0" };
  return {
    skin: skins[(expert.id * 3) % skins.length],
    hair: expert.years >= 24 ? "#8f8a86" : hairs[(expert.id * 7) % hairs.length],
    style: (expert.id * 5 + 2) % 6,
    glasses: expert.id % 3 === 0,
    ...palette,
  };
}

// Hair drawn behind the head (longer styles) and over it (fringe).
const backHair: Record<number, string | undefined> = {
  2: "M17.5,29 C16.5,16 24,11.5 32,11.5 C40,11.5 47.5,16 46.5,29 L47,42 C45,44.5 41.5,44.5 40.2,42.5 L40,30 L24,30 L23.8,42.5 C22.5,44.5 19,44.5 17,42 Z",
  3: "M17.2,30 C16,15.5 24,11 32,11 C40,11 48,15.5 46.8,30 L48.5,52 C44,55 40,54 38.5,50 L39,32 L25,32 L25.5,50 C24,54 20,55 15.5,52 Z",
};
const frontHair: Record<number, string> = {
  0: "M19.2,29 C18.5,18 24.5,13.2 32,13.2 C39.5,13.2 45.5,18 44.8,29 C43.6,23.5 40.5,20.6 36,20 C32,22 25,22.4 19.2,29 Z",
  1: "M19.2,30 C17.8,17.5 25,12.6 32.5,13 C40.5,13.4 46.4,18.4 44.8,30 C43.2,24 40.5,21.8 37.4,20.6 C33,24.2 25.5,24.6 19.2,30 Z",
  2: "M19.5,28 C19,18 25,14 32,14 C39,14 45,18 44.5,28 C40,22.5 36,21.5 32,21.8 C27,21.5 23,23 19.5,28 Z",
  3: "M19.5,29 C19,17 25.5,13.5 32,13.6 C39,13.6 45,17.5 44.6,29 C42,22 37,20 31,20.5 C26.5,21.5 22.5,24.5 19.5,29 Z",
  4: "M19.4,28.5 C19,18.5 25,14 32,14 C39,14 45,18.5 44.6,28.5 C42.6,23 38.6,20.4 32,20.4 C25.4,20.4 21.4,23 19.4,28.5 Z",
  5: "M19.6,27 C19.5,18.5 25,14.4 32,14.4 C39,14.4 44.5,18.5 44.4,27 C42.5,22 38.5,19.6 32,19.6 C25.5,19.6 21.5,22 19.6,27 Z",
};

function PortraitShapes({ look, clipId }: { look: Look; clipId: string }) {
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="64" height="64" fill={look.background} />
        {look.style === 4 && <circle cx="32" cy="11.5" r="5.6" fill={look.hair} />}
        {backHair[look.style] && <path d={backHair[look.style]} fill={look.hair} />}
        <rect x="27.5" y="37" width="9" height="10" rx="3" fill={look.skin} />
        <path d="M7,66 C8,51 18.5,45.5 32,45.5 C45.5,45.5 56,51 57,66 Z" fill={look.wear} />
        <path d="M26,46 L32,54 L38,46 L35.2,45 L32,49.4 L28.8,45 Z" fill="#f4f2f7" />
        <circle cx="19.8" cy="30.5" r="2.6" fill={look.skin} />
        <circle cx="44.2" cy="30.5" r="2.6" fill={look.skin} />
        <ellipse cx="32" cy="29.5" rx="12.4" ry="13.8" fill={look.skin} />
        <path d={frontHair[look.style]} fill={look.hair} />
        <path d="M24.6,26.4 Q27,25.2 29.4,26.2 M34.6,26.2 Q37,25.2 39.4,26.4" stroke={look.hair} strokeWidth="1.3" strokeLinecap="round" fill="none" />
        <ellipse cx="27" cy="30.6" rx="1.35" ry="1.65" fill="#2b2422" />
        <ellipse cx="37" cy="30.6" rx="1.35" ry="1.65" fill="#2b2422" />
        <circle cx="25" cy="34.4" r="2" fill="#ef9f98" opacity="0.32" />
        <circle cx="39" cy="34.4" r="2" fill="#ef9f98" opacity="0.32" />
        <path d="M29.6,36.4 Q32,38.4 34.4,36.4" stroke="#a35d4f" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        {look.glasses && (
          <g stroke="#3a3540" strokeWidth="1.1" fill="none">
            <circle cx="27" cy="30.6" r="3.7" />
            <circle cx="37" cy="30.6" r="3.7" />
            <path d="M30.7,30.4 L33.3,30.4" />
          </g>
        )}
      </g>
    </>
  );
}

/** Portrait as an image in HTML (candidate panel). */
export function Portrait({ expert, size = 40 }: { expert: Expert; size?: number }) {
  const clipId = `${useId().replace(/:/g, "")}-portrait`;
  return (
    <svg
      className="portrait"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={`${expert.name}の似顔絵（生成イラスト）`}
    >
      <PortraitShapes look={lookFor(expert)} clipId={clipId} />
    </svg>
  );
}
