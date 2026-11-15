import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chainName, isTestnet } from "@/config/network";
import { hemicycleGeometry, hemicycleRows } from "@/lib/hemicycle";
import { ArenaMark } from "./ArenaMark";
import { markColours, SITE_NAME } from "./brand";

/** Shared pieces of the share images (Open Graph + Twitter). 1200 x 630, graphite, Geist. */

export const OG_SIZE = { width: 1200, height: 630 };

type OgFont = { name: string; data: Buffer; weight: 400 | 600; style: "normal" };

// Fonts live in web/assets/fonts (Geist, OFL) and are added to the server bundle via
// outputFileTracingIncludes in next.config.ts — node_modules paths are not traced on Vercel.
const fontDir = join(process.cwd(), "assets/fonts");

/** Geist for the share images. Throws if the font files are missing, so a broken deploy fails loudly in logs. */
export async function loadOgFonts(): Promise<OgFont[]> {
  try {
    const [regular, semibold] = await Promise.all([
      readFile(join(fontDir, "Geist-Regular.ttf")),
      readFile(join(fontDir, "Geist-SemiBold.ttf")),
    ]);
    return [
      { name: "Geist", data: regular, weight: 400, style: "normal" },
      { name: "Geist", data: semibold, weight: 600, style: "normal" },
    ];
  } catch (err) {
    throw new Error(`Share-image fonts missing in ${fontDir}`, { cause: err });
  }
}

const networkLine = isTestnet ? `Runs on ${chainName}, a test network. No real money.` : "";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: markColours.graphite,
        color: markColours.seat,
        fontFamily: "Geist",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <ArenaMark size={64} />
        <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>{SITE_NAME}</span>
      </div>
      {children}
    </div>
  );
}

export function RootOgImage() {
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ fontSize: 92, fontWeight: 600, lineHeight: 1.02, letterSpacing: "-0.035em" }}>
          Arena — The room decides.
        </div>
        <div style={{ fontSize: 32, lineHeight: 1.35, color: markColours.muted, maxWidth: 940 }}>
          Only the people in the room can vote. The prize is locked in a smart contract before the first
          vote and paid to the winner when voting closes.
        </div>
      </div>
      <div style={{ fontSize: 24, color: markColours.muted }}>{networkLine}</div>
    </Frame>
  );
}

/** Seats nearest the centre line fill first, like the live chamber on the contest page. */
function Chamber({ votes, width }: { votes: number; width: number }) {
  const n = votes === 0 ? 24 : Math.max(24, Math.min(votes, 300));
  const seats = hemicycleGeometry(n);
  const filled = new Set(
    [...seats]
      .sort((a, b) => Math.abs(a.angle - Math.PI / 2) - Math.abs(b.angle - Math.PI / 2))
      .slice(0, Math.min(votes, n))
      .map((s) => s.index),
  );
  // Gap between neighbours in the tightest row decides the seat size.
  const rows = hemicycleRows(n);
  const perRow = new Map<number, number>();
  for (const s of seats) perRow.set(s.row, (perRow.get(s.row) ?? 0) + 1);
  let arc = Infinity;
  for (const [row, count] of perRow) {
    const radius = rows === 1 ? 1 : 0.4 + (row * 0.6) / (rows - 1);
    if (count > 1) arc = Math.min(arc, (Math.PI * radius) / (count - 1));
  }
  const r = Math.min(arc * 0.4, 0.09);
  const pad = r + 0.02;
  const height = Math.round(width * ((1 + 2 * pad) / (2 + 2 * pad)));
  return (
    <svg width={width} height={height} viewBox={`${-1 - pad} ${-1 - pad} ${2 + 2 * pad} ${1 + 2 * pad}`}>
      {seats.map((s) =>
        filled.has(s.index) ? (
          <circle key={s.index} cx={s.x} cy={-s.y} r={r} fill={markColours.seat} />
        ) : (
          <circle
            key={s.index}
            cx={s.x}
            cy={-s.y}
            r={r * 0.85}
            fill="none"
            stroke={markColours.subtle}
            strokeWidth={r * 0.25}
          />
        ),
      )}
    </svg>
  );
}

export function ContestOgImage({
  title,
  totalVotes,
  finalized,
}: {
  title: string | null;
  totalVotes: number | null;
  finalized: boolean;
}) {
  const votes = totalVotes ?? 0;
  const votesLine =
    totalVotes === null
      ? "Vote from your phone, in the room."
      : votes === 0
        ? "No votes yet."
        : `${votes.toLocaleString("en")} ${votes === 1 ? "vote" : "votes"}${finalized ? " · Voting closed" : " so far"}`;
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 620 }}>
          <div
            style={{
              fontSize: title && title.length > 40 ? 60 : 76,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
            }}
          >
            {title ?? "A contest on Arena"}
          </div>
          <div style={{ fontSize: 34, color: markColours.muted }}>{votesLine}</div>
        </div>
        <Chamber votes={votes} width={420} />
      </div>
      <div style={{ fontSize: 24, color: markColours.muted }}>{`The room decides. ${networkLine}`}</div>
    </Frame>
  );
}
