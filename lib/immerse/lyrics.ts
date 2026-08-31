/** Karaoke lyric line with start time in seconds. */
export type LyricLine = {
  t: number;
  text: string;
};

export type LyricsPayload = {
  source: "lrc" | "plain" | "none";
  lines: LyricLine[];
};

const LRC_LINE =
  /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;

/** Parse LRC timestamps or fall back to evenly spaced plain lines. */
export function parseLyricsText(
  raw: string | null | undefined,
  durationSecs?: number | null,
): LyricsPayload {
  const text = typeof raw === "string" ? raw.replace(/^\uFEFF/, "").trim() : "";
  if (!text) {
    return { source: "none", lines: [] };
  }

  const rawLines = text.split(/\r?\n/);
  const timed: LyricLine[] = [];
  let sawLrc = false;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(LRC_LINE);
    if (match) {
      sawLrc = true;
      const mins = Number(match[1]);
      const secs = Number(match[2]);
      const fracRaw = match[3] ?? "0";
      const frac =
        fracRaw.length <= 2
          ? Number(fracRaw) / 100
          : Number(fracRaw) / 1000;
      const t = mins * 60 + secs + (Number.isFinite(frac) ? frac : 0);
      const body = (match[4] ?? "").trim();
      if (body) timed.push({ t, text: body });
      continue;
    }
    if (!sawLrc) {
      timed.push({ t: -1, text: trimmed });
    }
  }

  if (sawLrc && timed.some((l) => l.t >= 0)) {
    return {
      source: "lrc",
      lines: timed
        .filter((l) => l.t >= 0 && l.text)
        .sort((a, b) => a.t - b.t),
    };
  }

  const plain = timed
    .map((l) => l.text)
    .filter(Boolean)
    .slice(0, 120);
  if (plain.length === 0) {
    return { source: "none", lines: [] };
  }

  const dur =
    typeof durationSecs === "number" &&
    Number.isFinite(durationSecs) &&
    durationSecs > 0
      ? durationSecs
      : Math.max(plain.length * 4, 30);
  const step = dur / plain.length;

  return {
    source: "plain",
    lines: plain.map((line, i) => ({
      t: Math.round(i * step * 100) / 100,
      text: line,
    })),
  };
}

/** Active lyric index for karaoke highlight (−1 when before first line). */
export function activeLyricIndex(lines: LyricLine[], currentTime: number) {
  if (lines.length === 0) return -1;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentTime + 0.05 >= lines[i].t) idx = i;
    else break;
  }
  return idx;
}
