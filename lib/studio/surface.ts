import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const RECT_OS_COOKIE = "rect-os";
export type RectOsSurface = "artist" | "sound";

export function setRectOsCookie(res: NextResponse, surface: RectOsSurface) {
  res.cookies.set(RECT_OS_COOKIE, surface, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearRectOsCookie(res: NextResponse) {
  res.cookies.set(RECT_OS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readRectOsSurface(): Promise<RectOsSurface | null> {
  const store = await cookies();
  const value = store.get(RECT_OS_COOKIE)?.value;
  if (value === "artist" || value === "sound") return value;
  return null;
}
