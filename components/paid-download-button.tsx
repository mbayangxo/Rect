"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DownloadTrackButton } from "@/components/download-track-button";
import {
  JOKO_PAYMENT_METHODS,
  type JokoPaymentMethodId,
} from "@/lib/joko/payments";
import type { TrackRow } from "@/lib/tracks";

type Props = {
  track: TrackRow;
  priceXof: number;
  owned?: boolean;
};

export function PaidDownloadButton({
  track,
  priceXof,
  owned: ownedProp = false,
}: Props) {
  const router = useRouter();
  const [owned, setOwned] = useState(ownedProp);
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<JokoPaymentMethodId>("wave");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOwned(ownedProp);
  }, [ownedProp]);

  if (owned) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[#1DB954]">Download owned</span>
        <DownloadTrackButton track={track} useEntitlementApi compact />
      </div>
    );
  }

  async function pay() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/tracks/${track.id}/download/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_method: paymentMethod, phone }),
      });
      const data = (await res.json()) as {
        error?: string;
        status?: string;
        checkout_url?: string | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Payment failed.");
        return;
      }

      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }

      if (data.status === "confirmed") {
        setOwned(true);
        setOpen(false);
        setMessage("Purchase confirmed — download unlocked.");
        router.refresh();
        return;
      }

      setMessage("Payment pending via JOKO — refresh when confirmed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-[#1DB954]/40 px-3 py-1 text-xs font-medium text-[#1DB954]"
      >
        Buy download · {priceXof.toLocaleString()} XOF
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs">
      <p className="font-medium">
        Pay with JOKO · {priceXof.toLocaleString()} XOF
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {JOKO_PAYMENT_METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setPaymentMethod(m.id)}
            className={`rounded-full px-2 py-1 ${
              paymentMethod === m.id
                ? "bg-[#1DB954] text-black"
                : "text-white/50"
            }`}
          >
            {m.shortLabel}
          </button>
        ))}
      </div>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Mobile money number"
        className="mt-2 w-full rounded border border-white/15 bg-black/30 px-2 py-1.5"
      />
      {error ? <p className="mt-2 text-red-400">{error}</p> : null}
      {message ? <p className="mt-2 text-[#1DB954]">{message}</p> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={pending || phone.length < 8}
          onClick={() => void pay()}
          className="rounded-full bg-[#1DB954] px-3 py-1 font-semibold text-black disabled:opacity-50"
        >
          {pending ? "…" : "Pay"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-white/40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
