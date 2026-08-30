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
  await prisma.$disconnect();
  if (!saved) {
    throw new Error("Contact API returned ok but inquiry was not in the database");
  }

  console.log("e2e ok", {
    site: health.site,
    artists: health.artists,
    inquiryId: saved.id,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
