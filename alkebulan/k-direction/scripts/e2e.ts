const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Non-JSON response ${response.status}: ${text.slice(0, 200)}`);
  }
}

async function main() {
  const healthRes = await fetch(`${base}/api/health`);
  const health = await readJson(healthRes);
  if (!healthRes.ok || health.ok !== true) {
    throw new Error(`Health failed: ${JSON.stringify(health)}`);
  }
  if (typeof health.artists !== "number" || health.artists < 1) {
    throw new Error("Health ok but no artists seeded");
  }

  const marker = `e2e-${Date.now()}`;
  const contactRes = await fetch(`${base}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Test",
      lastName: "Visitor",
      email: "visitor@example.com",
      message: marker,
    }),
  });
  const contact = await readJson(contactRes);
  if (!contactRes.ok || contact.ok !== true) {
    throw new Error(`Contact failed: ${JSON.stringify(contact)}`);
  }

  const { getPrisma } = await import("../lib/db");
  const prisma = getPrisma();
  const saved = await prisma.inquiry.findFirst({
    where: { message: marker },
  });
  if (!saved) {
    throw new Error("Contact API returned ok but inquiry was not in the database");
  }

  const resume = new File(["%PDF-1.1\n% e2e resume\n"], "ada-diallo.pdf", {
    type: "application/pdf",
  });
  const applyBody = new FormData();
  applyBody.set("firstName", "Ada");
  applyBody.set("lastName", "Diallo");
  applyBody.set("email", "ada@example.com");
  applyBody.set("note", `e2e apply ${marker}`);
  applyBody.set("jobSlug", "label-assistant");
  applyBody.set("resume", resume);
  const applyRes = await fetch(`${base}/api/apply`, {
    method: "POST",
    body: applyBody,
  });
  const apply = await readJson(applyRes);
  if (!applyRes.ok || apply.ok !== true) {
    throw new Error(`Apply failed: ${JSON.stringify(apply)}`);
  }
  const application = await prisma.jobApplication.findFirst({
    where: { note: `e2e apply ${marker}` },
  });
  await prisma.$disconnect();
  if (!application) {
    throw new Error("Apply API returned ok but application was not in the database");
  }
  if (!application.resumePath.startsWith("/portal/resumes/")) {
    throw new Error(`Resume path should be portal-only, got ${application.resumePath}`);
  }

  console.log("e2e ok", {
    site: health.site,
    artists: health.artists,
    inquiryId: saved.id,
    applicationId: application.id,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
