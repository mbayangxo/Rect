export type AnalyticsRangeId =
  | "today"
  | "week"
  | "month"
  | "3months"
  | "all"
  | "custom";

export type AnalyticsTimeWindow = {
  id: AnalyticsRangeId;
  label: string;
  from: string | null;
  to: string | null;
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function parseAnalyticsRange(
  raw: string | null | undefined,
  customFrom?: string | null,
  customTo?: string | null,
): AnalyticsTimeWindow {
  const now = new Date();
  const end = now.toISOString();
  const todayStart = startOfUtcDay(now).toISOString();

  const id: AnalyticsRangeId =
    raw === "today" ||
    raw === "week" ||
    raw === "month" ||
    raw === "3months" ||
    raw === "all" ||
    raw === "custom"
      ? raw
      : "week";

  if (id === "today") {
    return { id, label: "Today", from: todayStart, to: end };
  }

  if (id === "week") {
    const from = new Date(startOfUtcDay(now));
    from.setUTCDate(from.getUTCDate() - 6);
    return { id, label: "This week", from: from.toISOString(), to: end };
  }

  if (id === "month") {
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    return { id, label: "This month", from: from.toISOString(), to: end };
  }

  if (id === "3months") {
    const from = new Date(startOfUtcDay(now));
    from.setUTCMonth(from.getUTCMonth() - 3);
    return { id, label: "Last 3 months", from: from.toISOString(), to: end };
  }

  if (id === "custom") {
    const from =
      customFrom && !Number.isNaN(Date.parse(customFrom))
        ? new Date(customFrom).toISOString()
        : null;
    const to =
      customTo && !Number.isNaN(Date.parse(customTo))
        ? new Date(customTo).toISOString()
        : end;
    return {
      id,
      label: "Custom range",
      from,
      to,
    };
  }

  return { id: "all", label: "All time", from: null, to: end };
}

export function inTimeWindow(
  iso: string | null | undefined,
  window: AnalyticsTimeWindow,
): boolean {
  if (!iso) return false;
  if (window.from && iso < window.from) return false;
  if (window.to && iso > window.to) return false;
  return true;
}

export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function formatDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Credited streams require ~30s listen — minimum completion ratio at credit. */
export const CREDIT_LISTEN_SECS = 30;

export function minCompletionAtCredit(durationSecs: number | null | undefined): number | null {
  if (!durationSecs || durationSecs <= 0) return null;
  return Math.min(100, Math.round((CREDIT_LISTEN_SECS / durationSecs) * 100));
}
