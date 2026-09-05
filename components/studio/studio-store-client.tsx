"use client";

import { useState } from "react";
import {
  StoreDecoratePanel,
  type StoreLayoutId,
} from "@/components/studio/store-decorate-panel";
import { StudioMerchManager } from "@/components/studio/studio-merch-manager";
import type { ArtistMerchItem } from "@/lib/dashboard/artist-merch";

type Props = {
  initialItems: ArtistMerchItem[];
  storeReady: boolean;
  storeError: string | null;
  artistPortalHref: string;
  catalogTracks: { id: string; title: string }[];
  initialLayout: StoreLayoutId;
};

export function StudioStoreClient({
  initialItems,
  storeReady,
  storeError,
  artistPortalHref,
  catalogTracks,
  initialLayout,
}: Props) {
  const [layout, setLayout] = useState<StoreLayoutId>(initialLayout);
  const [layoutMsg, setLayoutMsg] = useState<string | null>(null);

  async function onLayoutChange(next: StoreLayoutId) {
    setLayout(next);
    setLayoutMsg(null);
    try {
      const res = await fetch("/api/artist/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist_store_layout: next }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setLayoutMsg(
          data.error ||
            "Layout saved locally — run 20260903_artist_store_layout.sql to persist.",
        );
        return;
      }
      setLayoutMsg("Layout saved — fans see it on your World store.");
    } catch {
      setLayoutMsg("Could not save layout.");
    }
  }

  return (
    <div className="space-y-10">
      <StoreDecoratePanel
        layout={layout}
        onLayoutChange={(l) => void onLayoutChange(l)}
        storeReady={storeReady}
        catalogTracks={catalogTracks}
      />
      {layoutMsg ? (
        <p className="text-sm text-white/45">{layoutMsg}</p>
      ) : null}
      <StudioMerchManager
        initialItems={initialItems}
        storeReady={storeReady}
        storeError={storeError}
        artistPortalHref={artistPortalHref}
        catalogTracks={catalogTracks}
      />
    </div>
  );
}
