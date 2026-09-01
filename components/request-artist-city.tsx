"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CULTURAL_PLACES } from "@/lib/cultural-options";

type Props = {
  artistId: string;
  artistName: string;
  isOwner: boolean;
  loginNext: string;
  initialMyCities?: string[];
  demandReady?: boolean;
};

export function RequestArtistCity({
  artistId,
  artistName,
  isOwner,
  loginNext,
  initialMyCities = [],
  demandReady = true,
}: Props) {
  const router = useRouter();
  const [city, setCity] = useState("");
  const [place, setPlace] = useState("");
  const [pending, setPending] = useState(false);
  const [myCities, setMyCities] = useState(initialMyCities);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isOwner) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !city.trim()) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/artist/city-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_id: artistId,
          city: city.trim(),
          place: place || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        authenticated?: boolean;
        city?: string;
      };
      if (res.status === 401) {
        window.location.href = `/auth/login?next=${encodeURIComponent(loginNext)}`;
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not send request.");
        return;
      }
      const c = data.city ?? city.trim();
      setMyCities((list) => (list.includes(c) ? list : [...list, c]));
      setMessage(`Requested ${artistName} in ${c}.`);
      setCity("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
      <h2 className="font-[family-name:var(--font-syne)] text-lg font-semibold">
        Bring {artistName} to your city
      </h2>
      <p className="mt-1 text-sm text-white/45">
        Tell them where to tour — artists see demand on their portal analytics.
      </p>
      {!demandReady ? (
        <p className="mt-3 text-xs text-[#F5A623]">
          City requests need{" "}
          <code className="text-[0.9em]">20260830_tour_demand_fekk.sql</code>.
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-white/45">City</span>
              <input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Dakar, Lagos, Accra…"
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#1DB954]/50"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/45">Country / place</span>
              <select
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[#1DB954]/50"
              >
                <option value="">Optional</option>
                {CULTURAL_PLACES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          {message ? <p className="text-sm text-[#1DB954]">{message}</p> : null}
          {myCities.length > 0 ? (
            <p className="text-xs text-white/40">
              You requested: {myCities.join(" · ")}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || city.trim().length < 2}
            className="rounded-full bg-[#1DB954] px-5 py-2 text-sm font-semibold text-black disabled:opacity-50"
          >
            {pending ? "Sending…" : "Request this city"}
          </button>
        </form>
      )}
    </section>
  );
}
