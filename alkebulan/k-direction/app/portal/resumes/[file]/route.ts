import { readFile } from "node:fs/promises";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isPortalTokenValid, PORTAL_COOKIE } from "@/lib/portal-auth";
import { resumeContentType, resumeDiskPath } from "@/lib/uploads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const jar = await cookies();
  if (!isPortalTokenValid(jar.get(PORTAL_COOKIE)?.value)) {
    return new NextResponse("Sign in to the portal to view resumes.", { status: 401 });
  }

  const { file } = await params;
  const disk = resumeDiskPath(file);
  if (!disk) {
    return new NextResponse("Not found", { status: 404 });
  }

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
    return new NextResponse("Not found", { status: 404 });
  }
}
