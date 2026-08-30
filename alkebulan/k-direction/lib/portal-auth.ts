import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const PORTAL_COOKIE = "kd_portal";

function secret() {
  return process.env.PORTAL_SECRET || process.env.PORTAL_PASSWORD || "dev-only-change-me";
}

export function portalPassword() {
  return process.env.PORTAL_PASSWORD || "";
}

export function signPortalToken() {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = `exp=${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function isPortalTokenValid(token: string | undefined) {
  if (!token) {
    return false;
  }
  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return false;
  }
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return false;
  }
  const exp = Number(payload.slice(4));
  return Number.isFinite(exp) && Date.now() < exp;
}

export async function isPortalAuthed() {
  const jar = await cookies();
  return isPortalTokenValid(jar.get(PORTAL_COOKIE)?.value);
}
