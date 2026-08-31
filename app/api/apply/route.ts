import { getPrisma } from "@/lib/db";
import { savePublicUpload } from "@/lib/uploads";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "Send a form with a resume." }, { status: 400 });
  }
  const form = await request.formData();
  const payload = {
    firstName: String(form.get("firstName") ?? "").trim(),
    lastName: String(form.get("lastName") ?? "").trim(),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    note: String(form.get("note") ?? "").trim(),
    jobSlug: String(form.get("jobSlug") ?? "").trim(),
  };
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email);
  if (!emailOk) {
    return NextResponse.json({ ok: false, error: "Enter a valid email." }, { status: 400 });
  }
  const job = await getPrisma().job.findUnique({ where: { slug: payload.jobSlug } });
  if (!job || !job.published) {
    return NextResponse.json({ ok: false, error: "That role is not open." }, { status: 404 });
  }
  const resume = form.get("resume");
  if (!(resume instanceof File) || resume.size === 0) {
    return NextResponse.json({ ok: false, error: "Attach a resume." }, { status: 400 });
  }
  try {
    const resumePath = await savePublicUpload(resume, "resumes");
    await getPrisma().jobApplication.create({
      data: {
        jobId: job.id,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        note: payload.note,
        resumePath,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save application.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
