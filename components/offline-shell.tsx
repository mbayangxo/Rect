"use client";

import { useEffect, useState } from "react";
import { syncStaleDownloads } from "@/lib/offline/track-downloads";
import type { TrackRow } from "@/lib/tracks";

type Props = {
  /** Liked / library tracks used to refresh stale offline files when back online. */
  syncTracks?: TrackRow[];
};

export function OfflineShell({ syncTracks = [] }: Props) {
  const [online, setOnline] = useState(true);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* best-effort PWA shell */
    });
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      if (syncTracks.length === 0) return;
      void syncStaleDownloads(syncTracks).then(({ updated }) => {
        if (updated > 0) {
          setSyncNote(
            updated === 1
              ? "Updated 1 offline track"
              : `Updated ${updated} offline tracks`,
          );
          window.setTimeout(() => setSyncNote(null), 4000);
        }
      });
    };
    const onOffline = () => setOnline(false);

    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncTracks]);

  if (online && !syncNote) return null;

  return (
    <div
      className={`fixed inset-x-0 top-0 z-[60] px-4 py-2 text-center text-xs font-medium ${
        online ? "bg-[#1DB954]/90 text-black" : "bg-[#F5A623]/95 text-black"
      }`}
      role="status"
    >
      {syncNote
        ? syncNote
        : "You're offline — downloaded tracks still play. We'll sync when you're back."}
    </div>
  );
}
