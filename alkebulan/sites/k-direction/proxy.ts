import { NextResponse, type NextRequest } from "next/server";
import { isPortalTokenValid, PORTAL_COOKIE } from "@/lib/portal-auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/portal")) {
    return NextResponse.next();
  }
  if (pathname === "/portal/login" || pathname.startsWith("/portal/login/")) {
    return NextResponse.next();
  }
  if (isPortalTokenValid(request.cookies.get(PORTAL_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const login = new URL("/portal/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/portal/:path*"],
};
