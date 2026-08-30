import { getPrisma } from "@/lib/db";

export function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function toDatetimeLocal(value?: Date | null) {
  if (!value) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
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
    where: { published: true },
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
    where: { artistId, published: true },
    orderBy: { publishedAt: "desc" },
  });
}

export async function getPublishedEvents() {
  return getPrisma().event.findMany({
    where: { published: true },
    orderBy: { startsAt: "asc" },
  });
}

export async function getEvent(slug: string) {
  return getPrisma().event.findUnique({
    where: { slug },
  });
}

export async function getPublishedJobs() {
  return getPrisma().job.findMany({
    where: { published: true },
    orderBy: { title: "asc" },
  });
}

export async function getJob(slug: string) {
  return getPrisma().job.findUnique({
    where: { slug },
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
