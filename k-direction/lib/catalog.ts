import { getPrisma } from "@/lib/db";

export function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export async function getSettings() {
  const settings = await getPrisma().siteSettings.findUnique({
    where: { id: "default" },
  });
  if (!settings) {
    throw new Error("Site settings are missing. Run npm run db:seed.");
  }
  return settings;
}

export async function getArtists() {
  return getPrisma().artist.findMany({
    orderBy: { displayName: "asc" },
  });
}

export async function getArtist(slug: string) {
  return getPrisma().artist.findUnique({
    where: { slug },
  });
}

export async function getNews() {
  return getPrisma().newsPost.findMany({
    orderBy: { publishedAt: "desc" },
    include: { artist: true },
  });
}

export async function getNewsPost(slug: string) {
  return getPrisma().newsPost.findUnique({
    where: { slug },
    include: { artist: true },
  });
}

export async function getNewsForArtist(artistId: string) {
  return getPrisma().newsPost.findMany({
    where: { artistId },
    orderBy: { publishedAt: "desc" },
  });
}

export async function getPublishedEvents() {
  return getPrisma().event.findMany({
    where: { published: true, startsAt: { gte: new Date() } },
    orderBy: { startsAt: "asc" },
  });
}

export async function getPublishedJobs() {
  return getPrisma().job.findMany({
    where: { published: true },
    orderBy: { title: "asc" },
  });
}

export function parsePostBody(body: string) {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Stored as plain text.
  }
  return body.split("\n").filter(Boolean);
}
