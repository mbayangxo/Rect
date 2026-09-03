import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type ApiKeyVerifyResult =
  | { ok: true; source: "env" | "database"; keyId?: string }
  | { ok: false; reason: "missing" | "invalid" | "revoked" };

function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1]?.trim() || null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

async function verifyDatabaseApiKey(
  token: string,
): Promise<ApiKeyVerifyResult> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, reason: "invalid" };
  }

  const keyHash = hashApiKey(token);
  const { data, error } = await admin
    .from("api_keys")
    .select("id, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: "invalid" };
  }

  if (data.revoked_at) {
    return { ok: false, reason: "revoked" };
  }

  return { ok: true, source: "database", keyId: data.id };
}

/**
 * Verifies Authorization Bearer against TAALI_API_KEY (Phase 1) or api_keys hash.
 */
export async function verifyApiKey(
  request: Request,
): Promise<ApiKeyVerifyResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, reason: "missing" };
  }

  const envKey = process.env.TAALI_API_KEY?.trim();
  if (envKey && safeEqual(token, envKey)) {
    return { ok: true, source: "env" };
  }

  return verifyDatabaseApiKey(token);
}

export async function requireApiKey(
  request: Request,
): Promise<ApiKeyVerifyResult & { ok: true }> {
  const result = await verifyApiKey(request);
  if (!result.ok) {
    throw new ApiKeyError(result.reason);
  }
  return result;
}

export class ApiKeyError extends Error {
  readonly reason: "missing" | "invalid" | "revoked";

  constructor(reason: "missing" | "invalid" | "revoked") {
    super(
      reason === "missing"
        ? "Missing Authorization Bearer token."
        : reason === "revoked"
          ? "API key has been revoked."
          : "Invalid API key.",
    );
    this.name = "ApiKeyError";
    this.reason = reason;
  }
}

/** Test helper: hash a raw key the same way api_keys rows are stored. */
export function hashApiKeyForStorage(key: string): string {
  return hashApiKey(key);
}
