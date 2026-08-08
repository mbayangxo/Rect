"use client";

import { useState } from "react";
import { TIP_AMOUNTS_XOF } from "@/lib/dashboard/tips";

type Props = {
  artistId: string;
  tipsReady?: boolean;
  /** Where to return after login (defaults to artist portal). */
  loginNext?: string;
  /** Icon control for the player bar. */
  compact?: boolean;
  /** Open amount picker upward (player bar). */
  dropUp?: boolean;
};

export function ArtistTipButton({
  artistId,
  tipsReady = true,
  loginNext,
  compact = false,
  dropUp = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function tip(amount: number) {
    if (!tipsReady || pending != null) return;
    setPending(amount);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_id: artistId, amount_xof: amount }),
      });
      const data = (await res.json()) as {
        error?: string;
        amount_xof?: number;
        authenticated?: boolean;
      };

      if (res.status === 401) {
        const next = loginNext || `/artists/${artistId}`;
        window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error || "Could not send tip");
        return;
      }
      setMessage(`Tipped ${data.amount_xof ?? amount} XOF`);
      setOpen(false);
      window.setTimeout(() => setMessage(null), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(null);
    }
  }

  const panel =
    open && tipsReady ? (
      <div
        className={
          compact
            ? `absolute right-0 z-30 w-44 rounded-xl border border-white/15 bg-[#071208] p-3 shadow-xl ${
                dropUp ? "bottom-full mb-2" : "mt-2"
              }`
            : "mt-3 flex flex-wrap gap-2"
        }
      >
        {compact ? (
          <div className="flex flex-col gap-1.5">
            {TIP_AMOUNTS_XOF.map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={pending != null}
                onClick={() => tip(amt)}
                className="rounded-lg bg-[#1DB954] px-3 py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
              >
                {pending === amt ? "…" : `${amt} XOF`}
              </button>
            ))}
            {error ? (
              <p className="text-xs text-[#F5A623]" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          TIP_AMOUNTS_XOF.map((amt) => (
            <button
              key={amt}
              type="button"
              disabled={pending != null}
              onClick={() => tip(amt)}
              className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
            >
              {pending === amt ? "…" : `${amt} XOF`}
            </button>
          ))
        )}
      </div>
    ) : null;

  if (compact) {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!tipsReady}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[0.55rem] font-semibold uppercase tracking-wide text-[#1DB954] hover:bg-[#1DB954]/15 disabled:opacity-40"
          aria-label={open ? "Close tip" : "Tip artist"}
          title="Tip artist"
        >
          {open ? "×" : "Tip"}
        </button>
        {panel}
        {message && !open ? (
          <span className="absolute bottom-full right-0 mb-1 whitespace-nowrap rounded bg-[#071208] px-2 py-1 text-[0.55rem] text-[#1DB954] shadow">
            {message}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!tipsReady}
        className="rounded-full border border-[#1DB954]/40 px-4 py-2 text-sm font-medium text-[#1DB954] hover:bg-[#1DB954]/10 disabled:opacity-40"
      >
        {open ? "Cancel tip" : "Tip artist"}
      </button>

      {!tipsReady ? (
        <p className="mt-2 text-xs text-white/35">
          Run artist tips SQL in Supabase to enable tips.
        </p>
      ) : null}

      {panel}

      {message ? (
        <p className="mt-2 text-sm text-[#1DB954]">{message}</p>
      ) : null}
      {error && !compact ? (
        <p className="mt-2 text-sm text-[#1DB954]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
