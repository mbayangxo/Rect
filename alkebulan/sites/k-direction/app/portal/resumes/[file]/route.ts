import { readFile } from "node:fs/promises";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isPortalTokenValid, PORTAL_COOKIE } from "@/lib/portal-auth";
import { resumeContentType, resumeSearchPaths } from "@/lib/uploads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const jar = await cookies();
  if (!isPortalTokenValid(jar.get(PORTAL_COOKIE)?.value)) {
    return new NextResponse("Sign in to the portal to view resumes.", { status: 401 });
  }

  const { file } = await params;
  const paths = resumeSearchPaths(file);
  if (paths.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  for (const disk of paths) {
    try {
      const bytes = await readFile(disk);
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": resumeContentType(file),
          "Content-Disposition": `inline; filename="${file}"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      // try the next location (legacy public uploads)
    }
  }
  return new NextResponse("Not found", { status: 404 });
}
