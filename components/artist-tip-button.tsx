"use client";

import { useState } from "react";
import { TIP_AMOUNTS_XOF, TIP_MESSAGE_MAX } from "@/lib/dashboard/tips";
import {
  JOKO_PAYMENT_METHODS,
  type JokoPaymentMethodId,
} from "@/lib/joko/payments";

type Props = {
  artistId: string;
  tipsReady?: boolean;
  /** Where to return after login (defaults to artist portal). */
  loginNext?: string;
  /** Icon control for the player bar. */
  compact?: boolean;
  /** Open amount picker upward (player bar). */
  dropUp?: boolean;
  /** Attribute tip to a track (song page / player). */
  trackId?: string | null;
  /** Display name for the track being tipped (tipper chrome). */
  trackTitle?: string | null;
};

export function ArtistTipButton({
  artistId,
  tipsReady = true,
  loginNext,
  compact = false,
  dropUp = false,
  trackId = null,
  trackTitle = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<JokoPaymentMethodId>("wave");
  const [pending, setPending] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onTrack =
    typeof trackTitle === "string" && trackTitle.trim()
      ? trackTitle.trim()
      : null;

  async function tip(amount: number) {
    if (!tipsReady || pending != null) return;
    if (phone.replace(/\s+/g, "").length < 8) {
      setError("Enter your mobile money / JOKO number.");
      return;
    }
    setPending(amount);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/tips/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_id: artistId,
          amount_xof: amount,
          message: note.trim() || undefined,
          track_id: trackId || undefined,
          payment_method: method,
          phone: phone.trim(),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        amount_xof?: number;
        authenticated?: boolean;
        mode?: string;
        status?: string;
        payment_label?: string;
        checkout_url?: string | null;
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
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      const via = data.payment_label || "JOKO";
      setMessage(
        data.mode === "demo"
          ? `Tip ${data.amount_xof ?? amount} XOF via ${via} (demo — credited when confirmed)`
          : data.status === "pending"
            ? `Tip pending on ${via} — artist credited when JOKO confirms`
            : `Tipped ${data.amount_xof ?? amount} XOF via ${via}${
                onTrack ? ` on ${onTrack}` : ""
              }`,
      );
      setNote("");
      setOpen(false);
      window.setTimeout(() => setMessage(null), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(null);
    }
  }

  const noteField = (
    <label className="block">
      <span className="sr-only">Optional note</span>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, TIP_MESSAGE_MAX))}
        rows={compact ? 2 : 2}
        maxLength={TIP_MESSAGE_MAX}
        placeholder="Optional note"
        disabled={pending != null}
        className={
          compact
            ? "mb-2 w-full resize-none rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/35 focus:border-[#1DB954]/50 focus:outline-none"
            : "mb-2 w-full max-w-md resize-none rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-[#1DB954]/50 focus:outline-none"
        }
      />
    </label>
  );

  const payFields = (
    <div className={compact ? "mb-2 space-y-1.5" : "mb-2 space-y-2"}>
      <label className="block">
        <span className="sr-only">Payment method</span>
        <select
          value={method}
          onChange={(e) => setMethod(e.target.value as JokoPaymentMethodId)}
          disabled={pending != null}
          className={
            compact
              ? "w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
              : "w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
          }
        >
          {JOKO_PAYMENT_METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="sr-only">Phone / wallet number</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Mobile money / JOKO number"
          disabled={pending != null}
          className={
            compact
              ? "w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/35"
              : "w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35"
          }
        />
      </label>
    </div>
  );

  const trackLine =
    onTrack && trackId ? (
      <p
        className={
          compact
            ? "mb-2 truncate text-[0.65rem] text-white/45"
            : "mb-2 text-xs text-white/45"
        }
        title={onTrack}
      >
        On <span className="text-[#1DB954]/90">{onTrack}</span>
      </p>
    ) : null;

  const panel =
    open && tipsReady ? (
      <div
        className={
          compact
            ? `absolute right-0 z-30 w-56 rounded-xl border border-white/15 bg-[#071208] p-3 shadow-xl ${
                dropUp ? "bottom-full mb-2" : "mt-2"
              }`
            : "mt-3"
        }
      >
        <p className="mb-2 text-[0.65rem] text-white/35">
          Pay with JOKO — Wave, Orange, MTN, JOKO wallet, or debit. Credits the
          artist wallet when confirmed.
        </p>
        {trackLine}
        {payFields}
        {noteField}
        {compact ? (
          <div className="flex flex-col gap-1.5">
            {TIP_AMOUNTS_XOF.map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={pending != null}
                onClick={() => void tip(amt)}
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
          <div className="flex flex-wrap gap-2">
            {TIP_AMOUNTS_XOF.map((amt) => (
              <button
                key={amt}
                type="button"
                disabled={pending != null}
                onClick={() => void tip(amt)}
                className="rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
              >
                {pending === amt ? "…" : `${amt} XOF`}
              </button>
            ))}
          </div>
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
          aria-label={
            open
              ? "Close tip"
              : onTrack
                ? `Tip artist for ${onTrack}`
                : "Tip artist"
          }
          title={onTrack ? `Tip for ${onTrack}` : "Tip artist"}
        >
          {open ? "×" : "Tip"}
        </button>
        {panel}
        {message && !open ? (
          <span className="absolute bottom-full right-0 mb-1 max-w-[14rem] truncate whitespace-nowrap rounded bg-[#071208] px-2 py-1 text-[0.55rem] text-[#1DB954] shadow">
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
        {open ? "Cancel tip" : onTrack ? "Tip this track" : "Tip artist"}
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
        <p className="mt-2 text-sm text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
