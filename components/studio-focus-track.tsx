"use client";

import { useEffect } from "react";

/** Scroll Studio library to a track after upload redirect (`?focus=`). */
export function StudioFocusTrack({ trackId }: { trackId: string | null }) {
  useEffect(() => {
    if (!trackId) return;
    const el = document.getElementById(`studio-track-${trackId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [trackId]);

  return null;
}
