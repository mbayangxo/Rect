"use client";

import { useState } from "react";
import type { ArtistMerchItem } from "@/lib/dashboard/artist-merch";
import { formatMerchPriceXof } from "@/lib/dashboard/artist-merch";
import {
  JOKO_PAYMENT_METHODS,
  type JokoPaymentMethodId,
} from "@/lib/joko/payments";

type Props = {
  items: ArtistMerchItem[];
  artistId: string;
  isOwner: boolean;
  loginNext: string;
};

export function ArtistMerchGrid({
  items,
  artistId,
  isOwner,
  loginNext,
}: Props) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<JokoPaymentMethodId>("wave");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) return null;

  async function pay(item: ArtistMerchItem) {
    if (payingId) return;
    setPayingId(item.id);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/merch/${item.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method: paymentMethod, phone }),
      });
      const data = (await res.json()) as {
        error?: string;
        authenticated?: boolean;
        title?: string;
        status?: string;
        checkout_url?: string | null;
      };

      if (res.status === 401) {
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }

      if (!res.ok || data.error) {
        setError(data.error || "Payment failed.");
        return;
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      setMessage(
        data.status === "confirmed"
          ? `Purchased ${data.title ?? item.title} — paid via JOKO mobile money.`
          : `Payment pending for ${data.title ?? item.title}.`,
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
        Store
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
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const cover = item.image_urls[0];
          const soldOut =
            item.quantity_available != null && item.quantity_available <= 0;
          const checkingOut = checkoutId === item.id;

          return (
            <li
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden"
            >
              <div className="aspect-square bg-black/40">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-white/20">
                    {item.title.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="p-4 space-y-2">
                <p className="font-semibold">{item.title}</p>
                {item.description ? (
                  <p className="text-xs text-white/45 line-clamp-2">
                    {item.description}
                  </p>
                ) : null}
                <p className="text-sm text-[#1DB954]">
                  {formatMerchPriceXof(item.price_xof)}
                  <span className="text-white/35 text-xs capitalize">
                    {" "}
                    · {item.category}
                  </span>
                </p>
                {soldOut ? (
                  <p className="text-xs text-[#F5A623]">Sold out</p>
                ) : isOwner ? (
                  <p className="text-xs text-white/35">
                    {item.sales_count} sale{item.sales_count === 1 ? "" : "s"}
                  </p>
                ) : checkingOut ? (
                  <div className="space-y-3 pt-1">
                    <p className="text-[0.65rem] uppercase tracking-wider text-white/35">
                      Pay with JOKO · mobile money only
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {JOKO_PAYMENT_METHODS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPaymentMethod(m.id)}
                          className={`rounded-lg border px-2 py-1.5 text-[0.65rem] ${
                            paymentMethod === m.id
                              ? "border-[#1DB954]/50 bg-[#1DB954]/10 text-[#1DB954]"
                              : "border-white/10 text-white/50"
                          }`}
                        >
                          {m.shortLabel}
                        </button>
                      ))}
                    </div>
                    <input
                      type="tel"
                      placeholder="+221 70 000 00 00"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs outline-none focus:border-[#1DB954]/50"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={payingId === item.id || phone.length < 8}
                        onClick={() => void pay(item)}
                        className="flex-1 rounded-full bg-[#1DB954] py-2 text-xs font-semibold text-black disabled:opacity-50"
                      >
                        {payingId === item.id ? "Processing…" : "Pay now"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckoutId(null)}
                        className="rounded-full border border-white/15 px-3 py-2 text-xs text-white/50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={soldOut}
                    onClick={() => {
                      setCheckoutId(item.id);
                      setError(null);
                      setMessage(null);
                    }}
                    className="mt-1 w-full rounded-full bg-[#1DB954] py-2 text-xs font-semibold text-black hover:bg-[#17a349] disabled:opacity-50"
                  >
                    Buy with JOKO
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
