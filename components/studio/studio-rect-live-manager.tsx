"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RectLive } from "@/lib/dashboard/rect-live";
import type { PortalRelease } from "@/lib/dashboard/portal-releases";

type Props = {
  artistId: string;
  initialLive: RectLive | null;
  missingTable: boolean;
  portals: PortalRelease[];
  countries: string[];
  city: string;
};

export function StudioRectLiveManager({
  artistId,
  initialLive,
  missingTable,
  portals,
  countries,
  city,
}: Props) {
  const router = useRouter();
  const [live, setLive] = useState(initialLive);
  const [title, setTitle] = useState("RECT Live");
  const [visibility, setVisibility] = useState<"public" | "fan_club" | "private">(
    "public",
  );
  const [host, setHost] = useState<"world" | "portal">("world");
  const [portalId, setPortalId] = useState(portals[0]?.id ?? "");
  const [country, setCountry] = useState(countries[0] ?? "");
  const [cityName, setCityName] = useState(city || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function goLive() {
    if (pending || missingTable) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/rect-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          visibility,
          host,
          portal_release_id: host === "portal" ? portalId || null : null,
          country: country || null,
          city: cityName || null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        rect_live_id?: string;
      };
      if (!res.ok || !data.rect_live_id) {
        setError(data.error || "Could not start RECT Live");
        return;
      }
      router.refresh();
      router.push(`/artists/${artistId}/rect-live/${data.rect_live_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function endLive() {
    if (!live || pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/rect-live", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rect_live_id: live.id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not end");
        return;
      }
      setLive(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {missingTable ? (
        <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          Run <code className="text-xs">20260830_rect_live.sql</code> in
          Supabase.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}

      {live?.status === "live" ? (
        <div className="rounded-2xl border border-[#1DB954]/40 bg-[#1DB954]/10 px-4 py-4">
          <p className="text-sm font-semibold text-[#1DB954]">
            RECT LIVE · {live.title}
          </p>
          <p className="mt-1 text-xs text-white/45">
            Professional performance · {live.host}
            {live.portal_release_id ? " portal" : " world"}
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href={`/artists/${artistId}/rect-live/${live.id}`}
              className="rounded-full bg-[#1DB954] px-4 py-2 text-xs font-semibold text-black"
            >
              Open stage
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => void endLive()}
              className="rounded-full border border-white/20 px-4 py-2 text-xs"
            >
              End RECT Live
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-xs text-white/40">
            RECT Live is for professional performances. Casual hangs use Live
            Room. Fan camera/audio SFU comes next — stage presence + chat work
            now.
          </p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
            placeholder="Performance title"
          />
          <select
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as typeof visibility)
            }
            className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
          >
            <option value="public">Public</option>
            <option value="fan_club">Fan club</option>
            <option value="private">Private</option>
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setHost("world")}
              className={`rounded-full px-3 py-1.5 text-xs ${host === "world" ? "bg-[#1DB954] text-black" : "border border-white/15"}`}
            >
              In World
            </button>
            <button
              type="button"
              onClick={() => setHost("portal")}
              className={`rounded-full px-3 py-1.5 text-xs ${host === "portal" ? "bg-[#1DB954] text-black" : "border border-white/15"}`}
            >
              In Portal (premiere)
            </button>
          </div>
          {host === "portal" ? (
            portals.length === 0 ? (
              <p className="text-xs text-[#F5A623]">
                Publish a portal in Studio → Portal first.
              </p>
            ) : (
              <select
                value={portalId}
                onChange={(e) => setPortalId(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
              >
                {portals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country"
              className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
            />
            <input
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
              placeholder="City"
              className="rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={
              pending ||
              missingTable ||
              (host === "portal" && !portalId)
            }
            onClick={() => void goLive()}
            className="rounded-full bg-[#1DB954] px-6 py-3 text-sm font-semibold text-black disabled:opacity-40"
          >
            {pending ? "Starting…" : "Start RECT Live"}
          </button>
        </div>
      )}
    </div>
  );
}
