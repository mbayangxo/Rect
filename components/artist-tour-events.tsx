"use client";

import { useState } from "react";
import type { TourEvent } from "@/lib/dashboard/tour-events";

type Props = {
  events: TourEvent[];
  isOwner: boolean;
  loginNext: string;
  ready: boolean;
};

export function ArtistTourEvents({
  events,
  isOwner,
  loginNext,
  ready,
}: Props) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [phone, setPhone] = useState("");
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return null;
  if (events.length === 0 && !isOwner) return null;

  async function buy(event: TourEvent) {
    if (payingId) return;
    setPayingId(event.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/tour-events/${event.id}/tickets/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: qty, phone }),
      });
      const data = (await res.json()) as {
        error?: string;
        authenticated?: boolean;
        status?: string;
        checkout_url?: string | null;
        title?: string;
        city?: string;
      };
      if (res.status === 401) {
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not buy tickets.");
        return;
      }
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setMessage(
        data.status === "confirmed"
          ? `Tickets confirmed for ${data.title ?? event.title} · ${data.city ?? event.city} (FEKK).`
          : "Payment pending on FEKK.",
      );
      setCheckoutId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/40">
        Tour & events · FEKK tickets
      </h2>
      {message ? (
        <p className="mb-4 rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          {error}
        </p>
      ) : null}

      {events.length === 0 ? (
        <p className="text-sm text-white/40">
          No upcoming shows. Artists add dates in Studio → Tours.
        </p>
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => {
            const soldOut =
              ev.capacity != null && ev.tickets_sold >= ev.capacity;
            const checkingOut = checkoutId === ev.id;
            const when = ev.starts_at
              ? new Date(ev.starts_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "";

            return (
              <li
                key={ev.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{ev.title}</p>
                    <p className="mt-0.5 text-sm text-white/45">
                      {ev.city}
                      {ev.venue ? ` · ${ev.venue}` : ""}
                      {when ? ` · ${when}` : ""}
                    </p>
                    {ev.description ? (
                      <p className="mt-2 text-xs text-white/40 line-clamp-2">
                        {ev.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    {ev.ticket_price_xof != null && ev.ticket_price_xof > 0 ? (
                      <p className="text-sm font-semibold text-[#1DB954]">
                        {ev.ticket_price_xof.toLocaleString()} XOF
                      </p>
                    ) : (
                      <p className="text-xs text-white/35">Price on FEKK</p>
                    )}
                    <p className="mt-0.5 text-[0.65rem] text-white/35">
                      {ev.tickets_sold} sold
                      {ev.capacity != null ? ` / ${ev.capacity}` : ""}
                    </p>
                  </div>
                </div>

                {!isOwner && !soldOut && ev.ticket_price_xof != null && ev.ticket_price_xof > 0 ? (
                  checkingOut ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <label className="text-xs text-white/45">
                          Qty
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={qty}
                            onChange={(e) =>
                              setQty(Math.max(1, Number(e.target.value) || 1))
                            }
                            className="ml-2 w-16 rounded border border-white/15 bg-black/30 px-2 py-1"
                          />
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Phone (optional)"
                          className="min-w-[10rem] flex-1 rounded border border-white/15 bg-black/30 px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={payingId === ev.id}
                          onClick={() => void buy(ev)}
                          className="rounded-full bg-[#1DB954] px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                        >
                          {payingId === ev.id ? "…" : "Pay on FEKK"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCheckoutId(null)}
                          className="text-xs text-white/40"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setCheckoutId(ev.id);
                        setQty(1);
                      }}
                      className="mt-3 rounded-full border border-[#1DB954]/40 px-4 py-1.5 text-xs font-medium text-[#1DB954]"
                    >
                      Buy tickets
                    </button>
                  )
                ) : null}
                {soldOut && !isOwner ? (
                  <p className="mt-2 text-xs text-[#F5A623]">Sold out</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
