"use client";

import type { TrackRow } from "@/lib/tracks";
import { trackArtist, trackTitle } from "@/lib/tracks";

const DB_NAME = "rect-offline-v1";
const STORE = "tracks";
const DB_VERSION = 1;

export type OfflineTrackMeta = {
  trackId: string;
  sourceUrl: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  downloadedAt: number;
  updatedAt: number;
  bytes: number;
};

type OfflineRecord = OfflineTrackMeta & {
  audioBlob: Blob;
  coverBlob: Blob | null;
};

const objectUrlCache = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "trackId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
    req.onsuccess = () => resolve(req.result as T | undefined);
  });
}

function idbPut(db: IDBDatabase, value: OfflineRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(value);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB write failed"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(key);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB delete failed"));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

function idbAll<T>(db: IDBDatabase): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onerror = () => reject(req.error ?? new Error("IndexedDB list failed"));
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
  });
}

function revokeObjectUrl(trackId: string) {
  const prev = objectUrlCache.get(trackId);
  if (prev) {
    URL.revokeObjectURL(prev);
    objectUrlCache.delete(trackId);
  }
}

export function isOfflineCapable(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function listOfflineTracks(): Promise<OfflineTrackMeta[]> {
  if (!isOfflineCapable()) return [];
  const db = await openDb();
  const rows = await idbAll<OfflineRecord>(db);
  db.close();
  return rows
    .map(({ audioBlob: _a, coverBlob: _c, ...meta }) => meta)
    .sort((a, b) => b.downloadedAt - a.downloadedAt);
}

export async function isTrackDownloaded(trackId: string): Promise<boolean> {
  if (!isOfflineCapable()) return false;
  const db = await openDb();
  const row = await idbGet<OfflineRecord>(db, trackId);
  db.close();
  return Boolean(row);
}

export async function removeOfflineTrack(trackId: string): Promise<void> {
  if (!isOfflineCapable()) return;
  revokeObjectUrl(trackId);
  const db = await openDb();
  await idbDelete(db, trackId);
  db.close();
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

/** Resolve audio URL via entitlement API (handles paid downloads). */
export async function resolveTrackDownloadUrl(trackId: string): Promise<string> {
  const res = await fetch(`/api/tracks/${trackId}/download`, {
    cache: "no-store",
  });
  const data = (await res.json()) as {
    error?: string;
    url?: string;
    code?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Download not available.");
  }
  return data.url;
}

/** Save track audio (+ cover) for offline playback. Re-downloads if source URL changed. */
export async function downloadTrack(
  track: TrackRow,
  onProgress?: (pct: number) => void,
  options?: { useEntitlementApi?: boolean },
): Promise<void> {
  if (!isOfflineCapable()) {
    throw new Error("Offline storage is not available in this browser.");
  }

  onProgress?.(5);
  let audioUrl = track.audio_url?.trim() ?? "";
  if (options?.useEntitlementApi || !audioUrl) {
    audioUrl = await resolveTrackDownloadUrl(track.id);
  }
  if (!audioUrl) throw new Error("This track has no audio file yet.");
  const db = await openDb();
  const existing = await idbGet<OfflineRecord>(db, track.id);
  if (existing && existing.sourceUrl === audioUrl) {
    db.close();
    onProgress?.(100);
    return;
  }

  onProgress?.(15);
  const audioBlob = await fetchBlob(audioUrl);
  onProgress?.(70);

  let coverBlob: Blob | null = null;
  const coverUrl = track.cover_art_url?.trim();
  if (coverUrl) {
    try {
      coverBlob = await fetchBlob(coverUrl);
    } catch {
      coverBlob = null;
    }
  }

  revokeObjectUrl(track.id);
  const now = Date.now();
  await idbPut(db, {
    trackId: track.id,
    sourceUrl: audioUrl,
    title: trackTitle(track),
    artistName: trackArtist(track),
    coverUrl: coverUrl || null,
    downloadedAt: existing?.downloadedAt ?? now,
    updatedAt: now,
    bytes: audioBlob.size + (coverBlob?.size ?? 0),
    audioBlob,
    coverBlob,
  });
  db.close();
  onProgress?.(100);
}

/** Prefer local blob URL when downloaded — saves mobile data online too. */
export async function resolvePlaybackUrl(
  track: TrackRow,
): Promise<string | null> {
  const network = track.audio_url?.trim();
  if (!isOfflineCapable()) return network ?? null;

  try {
    const db = await openDb();
    const row = await idbGet<OfflineRecord>(db, track.id);
    db.close();
    if (!row?.audioBlob) return network ?? null;

    if (network && row.sourceUrl !== network) {
      return network;
    }

    const cached = objectUrlCache.get(track.id);
    if (cached) return cached;
    const url = URL.createObjectURL(row.audioBlob);
    objectUrlCache.set(track.id, url);
    return url;
  } catch {
    return network ?? null;
  }
}

/** When back online, refresh stale downloads (URL changed on server). */
export async function syncStaleDownloads(
  tracks: TrackRow[],
): Promise<{ updated: number; failed: number }> {
  if (!isOfflineCapable() || typeof navigator !== "undefined" && !navigator.onLine) {
    return { updated: 0, failed: 0 };
  }

  const byId = new Map(tracks.map((t) => [t.id, t]));
  const offline = await listOfflineTracks();
  let updated = 0;
  let failed = 0;

  for (const meta of offline) {
    const live = byId.get(meta.trackId);
    if (!live?.audio_url?.trim()) continue;
    if (live.audio_url.trim() === meta.sourceUrl) continue;
    try {
      await downloadTrack(live);
      updated += 1;
    } catch {
      failed += 1;
    }
  }

  return { updated, failed };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 1) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
