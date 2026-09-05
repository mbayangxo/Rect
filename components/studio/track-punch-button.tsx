"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  trackId: string;
  punchStatus?: string | null;
  qcStatus?: string | null;
  contentKind?: string | null;
};

export function TrackPunchButton({
  trackId,
  punchStatus,
  qcStatus,
  contentKind,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if ((contentKind || "music") === "podcast") return null;

  const status = (punchStatus || "").toLowerCase();
  const qcFail = (qcStatus || "").toLowerCase() === "fail";

  async function post(action: "request" | "ready" | "cancel") {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tracks/${trackId}/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(data.error || "Punch update failed.");
        return;
      }
      setMessage(
        action === "ready"
          ? "Punch marked ready (demo master)."
          : action === "cancel"
            ? "Punch cancelled."
            : "RECT Punch requested.",
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (status === "ready") {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--rect)]/40 px-3 py-1 text-[0.65rem] text-[var(--rect)]">
            Punch ready
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => void post("cancel")}
            className="rounded-full border border-white/15 px-3 py-1 text-[0.65rem] text-white/45 hover:border-white/30 disabled:opacity-40"
          >
            {pending ? "…" : "Clear"}
          </button>
        </span>
        {message ? (
          <span className="max-w-[12rem] text-[0.55rem] text-[#F5A623]">
            {message}
          </span>
        ) : null}
      </span>
    );
  }

  if (status === "requested" || status === "processing") {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/15 px-3 py-1 text-[0.65rem] text-white/45">
            Punch {status}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => void post("ready")}
            className="rounded-full border border-[var(--rect)]/35 px-3 py-1 text-[0.65rem] text-[var(--rect)] hover:bg-[var(--rect)]/10 disabled:opacity-40"
            title="Demo: set punch_audio_url to the upload master for Delivery"
          >
            {pending ? "…" : "Mark ready"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void post("cancel")}
            className="rounded-full border border-white/15 px-3 py-1 text-[0.65rem] text-white/45 hover:border-white/30 disabled:opacity-40"
          >
            Cancel
          </button>
        </span>
        {message ? (
          <span className="max-w-[12rem] text-[0.55rem] text-[#F5A623]">
            {message}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending || qcFail}
        onClick={() => void post("request")}
        className="rounded-full border border-white/15 px-3 py-1 text-[0.65rem] text-white/55 hover:border-[var(--rect)]/40 disabled:opacity-40"
        title={qcFail ? "Pass Upload QC first" : "Request RECT Punch mastering"}
      >
        {pending ? "…" : "RECT Punch"}
      </button>
      {message ? (
        <span className="max-w-[10rem] text-[0.55rem] text-[#F5A623]">
          {message}
        </span>
      ) : null}
    </span>
  );
}
