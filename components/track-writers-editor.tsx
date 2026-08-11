"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { WriterSplit } from "@/lib/dashboard/writer-splits";

type WriterRow = { id: string; name: string; percent: string };

type Props = {
  trackId: string;
  initialWriters: WriterSplit[];
  /** Compact summary under Studio track rows. */
  compact?: boolean;
};

function toRows(writers: WriterSplit[]): WriterRow[] {
  if (writers.length === 0) {
    return [{ id: crypto.randomUUID(), name: "", percent: "100" }];
  }
  return writers.map((w) => ({
    id: crypto.randomUUID(),
    name: w.writer_name,
    percent: String(w.share_percent),
  }));
}

export function TrackWritersEditor({
  trackId,
  initialWriters,
  compact = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WriterRow[]>(() => toRows(initialWriters));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [display, setDisplay] = useState(initialWriters);

  const total = useMemo(() => {
    return rows.reduce((sum, w) => {
      const n = Number(w.percent);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }, [rows]);
  const splitsOk = Math.abs(total - 100) <= 0.01;

  function openEditor() {
    setRows(toRows(display));
    setError(null);
    setSaved(false);
    setOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!splitsOk) {
      setError(`Writer splits must total 100% (now ${total.toFixed(1)}%).`);
      return;
    }
    for (const w of rows) {
      if (!w.name.trim()) {
        setError("Each writer needs a name.");
        return;
      }
    }

    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/tracks/${trackId}/writers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writers: rows.map((w) => ({
            name: w.name.trim(),
            percent: Number(w.percent),
          })),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not save writers");
        return;
      }
      const next: WriterSplit[] = rows.map((w, i) => ({
        id: null,
        writer_name: w.name.trim(),
        share_percent: Math.round(Number(w.percent) * 100) / 100,
        sort_order: i,
      }));
      setDisplay(next);
      setSaved(true);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  const summary =
    display.length > 0
      ? display.map((w) => `${w.writer_name} ${w.share_percent}%`).join(" · ")
      : "No writer credits yet";

  return (
    <div className={compact ? "relative mt-2" : "relative"}>
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={`min-w-0 flex-1 ${
            compact ? "text-[0.65rem] text-white/40" : "text-sm text-white/55"
          }`}
        >
          {compact ? (
            <>
              <span className="uppercase tracking-[0.12em] text-white/30">
                Writers ·{" "}
              </span>
              {summary}
            </>
          ) : (
            summary
          )}
        </p>
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openEditor())}
          className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-white/50 hover:border-white/40 hover:text-white/80"
        >
          {open ? "Close" : display.length > 0 ? "Edit splits" : "Add splits"}
        </button>
        {saved && !open ? (
          <span className="text-[0.55rem] uppercase tracking-[0.12em] text-[#1DB954]">
            Saved
          </span>
        ) : null}
      </div>

      {open ? (
        <form
          onSubmit={(e) => void onSave(e)}
          className="absolute left-0 z-20 mt-2 w-[min(100%,22rem)] rounded-xl border border-white/15 bg-[#071208] p-3 text-left shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[0.55rem] uppercase tracking-[0.14em] text-white/40">
              Writer splits
            </span>
            <span
              className={`text-[0.65rem] ${
                splitsOk ? "text-[#1DB954]" : "text-[#F5A623]"
              }`}
            >
              Total {total.toFixed(1)}%
            </span>
          </div>
          <ul className="space-y-2">
            {rows.map((w, i) => (
              <li key={w.id} className="flex flex-wrap gap-2">
                <input
                  value={w.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setRows((list) =>
                      list.map((row, idx) =>
                        idx === i ? { ...row, name } : row,
                      ),
                    );
                  }}
                  placeholder="Writer name"
                  className="min-w-[8rem] flex-1 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-sm outline-none focus:border-[#1DB954]"
                />
                <input
                  value={w.percent}
                  onChange={(e) => {
                    const percent = e.target.value;
                    setRows((list) =>
                      list.map((row, idx) =>
                        idx === i ? { ...row, percent } : row,
                      ),
                    );
                  }}
                  inputMode="decimal"
                  placeholder="%"
                  className="w-16 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-sm outline-none focus:border-[#1DB954]"
                />
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRows((list) => list.filter((_, idx) => idx !== i))
                    }
                    className="rounded-full border border-white/20 px-2 py-1 text-[0.65rem] text-white/50 hover:bg-white/10"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              setRows((list) => [
                ...list,
                { id: crypto.randomUUID(), name: "", percent: "" },
              ])
            }
            className="mt-2 text-[0.65rem] text-[#1DB954] hover:underline"
          >
            + Add writer
          </button>
          <p className="mt-2 text-[0.55rem] text-white/30">
            Credits for royalty splits — not a payout yet.
          </p>
          {error ? (
            <p className="mt-2 text-xs text-[#F5A623]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || !splitsOk}
            className="mt-3 w-full rounded-full bg-[#1DB954] py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save splits"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
