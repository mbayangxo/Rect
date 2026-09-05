"use client";

type Props = {
  status?: string | null;
  lufs?: number | null;
  peak?: number | null;
  compact?: boolean;
};

export function TrackQcBadge({ status, lufs, peak, compact }: Props) {
  const s = (status || "").toLowerCase();
  if (!s || s === "pending") {
    return compact ? null : (
      <span className="text-[0.6rem] uppercase tracking-wider text-white/30">
        QC pending
      </span>
    );
  }

  const color =
    s === "pass"
      ? "text-[var(--rect)] border-[var(--rect)]/35"
      : s === "warn"
        ? "text-[#F5A623] border-[#F5A623]/35"
        : "text-red-300 border-red-400/35";

  const bits = [s.toUpperCase()];
  if (lufs != null && Number.isFinite(lufs)) {
    bits.push(`${Number(lufs).toFixed(1)} LUFS`);
  }
  if (peak != null && Number.isFinite(peak)) {
    bits.push(`${Number(peak).toFixed(1)} dBTP`);
  }

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wider ${color}`}
      title="Upload QC"
    >
      {bits.join(" · ")}
    </span>
  );
}
