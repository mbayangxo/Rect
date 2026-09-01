/**
 * Taali distribution rail — RECT hands releases to Taali for DSP delivery.
 * Live when TAALI_API_URL + TAALI_API_KEY are set; otherwise honest demo queue.
 */

export function isTaaliLive(): boolean {
  const url = process.env.TAALI_API_URL?.trim();
  const key = process.env.TAALI_API_KEY?.trim();
  return Boolean(url && key && url.startsWith("http"));
}

export type TaaliCreateReleaseInput = {
  releaseId: string;
  artistId: string;
  title: string;
  upc?: string | null;
  releaseDate?: string | null;
  coverArtUrl?: string | null;
  territories: string[];
  dspTargets: string[];
  tracks: {
    trackId: string;
    title: string;
    isrc?: string | null;
    audioUrl: string;
    trackNumber: number;
  }[];
};

export type TaaliSubmitResult =
  | {
      ok: true;
      mode: "live" | "demo";
      taaliReleaseId: string;
      status: "queued" | "submitted";
    }
  | { ok: false; error: string };

export async function taaliSubmitRelease(
  input: TaaliCreateReleaseInput,
): Promise<TaaliSubmitResult> {
  if (!isTaaliLive()) {
    return {
      ok: true,
      mode: "demo",
      taaliReleaseId: `demo-${input.releaseId}`,
      status: "queued",
    };
  }

  const base = process.env.TAALI_API_URL!.replace(/\/$/, "");
  const key = process.env.TAALI_API_KEY!;

  try {
    const res = await fetch(`${base}/v1/releases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        external_id: input.releaseId,
        artist_external_id: input.artistId,
        title: input.title,
        upc: input.upc ?? undefined,
        release_date: input.releaseDate ?? undefined,
        cover_url: input.coverArtUrl ?? undefined,
        territories: input.territories,
        dsp_targets: input.dspTargets,
        tracks: input.tracks.map((t) => ({
          external_id: t.trackId,
          title: t.title,
          isrc: t.isrc ?? undefined,
          audio_url: t.audioUrl,
          track_number: t.trackNumber,
        })),
        webhook_url: process.env.TAALI_WEBHOOK_URL?.trim() || undefined,
      }),
    });

    const data = (await res.json().catch(() => null)) as {
      id?: string;
      release_id?: string;
      error?: string;
      message?: string;
    } | null;

    if (!res.ok) {
      return {
        ok: false,
        error:
          data?.error ||
          data?.message ||
          `Taali rejected release (${res.status}).`,
      };
    }

    const taaliId = data?.id || data?.release_id;
    if (!taaliId) {
      return { ok: false, error: "Taali response missing release id." };
    }

    return {
      ok: true,
      mode: "live",
      taaliReleaseId: String(taaliId),
      status: "submitted",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Taali network error",
    };
  }
}

export function verifyTaaliWebhookSecret(header: string | null): boolean {
  const secret = process.env.TAALI_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!header) return false;
  return header === secret || header === `Bearer ${secret}`;
}
