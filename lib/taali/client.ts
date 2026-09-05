/**
 * Taali distribution rail — RECT hands releases to Taali for DSP delivery.
 * Live when TAALI_API_URL + TAALI_API_KEY + TAALI_ORG_ID are set;
 * otherwise honest demo queue (never claims Spotify/Apple live).
 */

export function isTaaliLive(): boolean {
  const url = process.env.TAALI_API_URL?.trim();
  const key = process.env.TAALI_API_KEY?.trim();
  const org = process.env.TAALI_ORG_ID?.trim();
  return Boolean(url && key && org && url.startsWith("http"));
}

/** Which Taali env vars are present (no secret values). For Delivery UI. */
export type TaaliEnvChecklist = {
  live: boolean;
  hasUrl: boolean;
  hasKey: boolean;
  hasOrg: boolean;
  hasWebhookSecret: boolean;
  missing: string[];
};

export function getTaaliEnvChecklist(): TaaliEnvChecklist {
  const hasUrl = Boolean(process.env.TAALI_API_URL?.trim());
  const hasKey = Boolean(process.env.TAALI_API_KEY?.trim());
  const hasOrg = Boolean(process.env.TAALI_ORG_ID?.trim());
  const hasWebhookSecret = Boolean(process.env.TAALI_WEBHOOK_SECRET?.trim());
  const missing: string[] = [];
  if (!hasUrl) missing.push("TAALI_API_URL");
  if (!hasKey) missing.push("TAALI_API_KEY");
  if (!hasOrg) missing.push("TAALI_ORG_ID");
  return {
    live: hasUrl && hasKey && hasOrg && Boolean(process.env.TAALI_API_URL?.trim()?.startsWith("http")),
    hasUrl,
    hasKey,
    hasOrg,
    hasWebhookSecret,
    missing,
  };
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

/** Normalize so both `https://host` and `https://host/api` work. */
function taaliApiBase(): string {
  const raw = process.env.TAALI_API_URL!.replace(/\/$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

async function taaliFetch(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const key = process.env.TAALI_API_KEY!;
  const res = await fetch(`${taaliApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const data = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return { ok: res.ok, status: res.status, data };
}

function taaliError(
  data: Record<string, unknown> | null,
  status: number,
  fallback: string,
): string {
  if (data && typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }
  if (data && typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }
  return `${fallback} (${status}).`;
}

/**
 * Create → validate → submit on Taali.
 * Without env, returns demo queue (RECT shows queued, not live on DSP).
 */
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

  const organizationId = process.env.TAALI_ORG_ID!.trim();
  const providerId =
    process.env.TAALI_PROVIDER_ID?.trim() || "demo";
  const destinations =
    input.dspTargets.length > 0
      ? input.dspTargets
      : ["spotify", "apple_music", "youtube_music", "deezer", "tidal"];

  try {
    const created = await taaliFetch("/v1/releases", {
      method: "POST",
      body: JSON.stringify({
        organization_id: organizationId,
        title: input.title,
        release_type: input.tracks.length > 1 ? "ep" : "single",
        rect_external_id: input.releaseId,
        rect_artist_external_id: input.artistId,
        upc: input.upc ?? undefined,
        release_date: input.releaseDate ?? undefined,
        cover_url: input.coverArtUrl ?? undefined,
        territories: input.territories.length ? input.territories : ["WW"],
        dsp_targets: destinations,
        tracks: input.tracks.map((t) => ({
          title: t.title,
          track_number: t.trackNumber,
          isrc: t.isrc ?? undefined,
          audio_url: t.audioUrl,
          rect_external_id: t.trackId,
        })),
      }),
    });

    if (!created.ok) {
      return {
        ok: false,
        error: taaliError(created.data, created.status, "Taali rejected release"),
      };
    }

    const taaliId = String(
      created.data?.id || created.data?.release_id || "",
    );
    if (!taaliId) {
      return { ok: false, error: "Taali response missing release id." };
    }

    const validated = await taaliFetch(`/v1/releases/${taaliId}/validate`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    if (!validated.ok) {
      return {
        ok: false,
        error: taaliError(
          validated.data,
          validated.status,
          "Taali validation failed",
        ),
      };
    }

    const submitted = await taaliFetch(`/v1/releases/${taaliId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        provider_id: providerId,
        destinations,
      }),
    });

    if (!submitted.ok) {
      return {
        ok: false,
        error: taaliError(
          submitted.data,
          submitted.status,
          "Taali submit failed",
        ),
      };
    }

    const deliveryStatus =
      typeof submitted.data?.status === "string"
        ? submitted.data.status
        : "queued";

    // not_configured / pending still means handed off — never "live on Spotify"
    const status: "queued" | "submitted" =
      deliveryStatus === "queued" ||
      deliveryStatus === "processing" ||
      deliveryStatus === "delivered"
        ? "submitted"
        : "queued";

    return {
      ok: true,
      mode: "live",
      taaliReleaseId: taaliId,
      status,
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
