"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db";
import { PORTAL_COOKIE, portalPassword, signPortalToken } from "@/lib/portal-auth";
import { bodyFromTextarea, savePublicUpload, slugify } from "@/lib/uploads";

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function checked(form: FormData, key: string) {
  return form.get(key) === "on" || form.get(key) === "true";
}

async function savePhoto(form: FormData, key: string) {
  const file = form.get(key);
  if (file instanceof File && file.size > 0) {
    return savePublicUpload(file, "photos");
  }
  return null;
}

export async function loginPortal(formData: FormData) {
  const password = text(formData, "password");
  const next = text(formData, "next") || "/portal";
  if (!portalPassword() || password !== portalPassword()) {
    redirect("/portal/login?error=1");
  }
  const jar = await cookies();
  jar.set(PORTAL_COOKIE, signPortalToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect(next.startsWith("/portal") ? next : "/portal");
}

export async function logoutPortal() {
  const jar = await cookies();
  jar.delete(PORTAL_COOKIE);
  redirect("/portal/login");
}

export async function saveSettings(formData: FormData) {
  await getPrisma().siteSettings.update({
    where: { id: "default" },
    data: {
      name: text(formData, "name") || "K-DIRECTION",
      legal: text(formData, "legal"),
      mission: text(formData, "mission"),
      bookingsEmail: text(formData, "bookingsEmail"),
      inquiriesEmail: text(formData, "inquiriesEmail"),
      inquiryDestination: text(formData, "inquiryDestination") || "portal",
      kebuUrl: text(formData, "kebuUrl") || null,
      jokoUrl: text(formData, "jokoUrl") || null,
    },
  });
  revalidatePath("/", "layout");
  redirect("/portal/settings");
}

export async function saveArtist(formData: FormData) {
  const id = text(formData, "id");
  const name = text(formData, "name");
  const displayName = text(formData, "displayName") || name;
  const slug = slugify(text(formData, "slug") || displayName);
  const photo = await savePhoto(formData, "portrait");
  const existing = id
    ? await getPrisma().artist.findUnique({ where: { id } })
    : null;
  const data = {
    slug,
    name,
    displayName,
    debut: text(formData, "debut"),
    bio: text(formData, "bio"),
    kebuUrl: text(formData, "kebuUrl") || null,
    portraitAlt: text(formData, "portraitAlt") || displayName,
    portrait: photo || existing?.portrait || "",
  };
  if (!data.portrait) {
    throw new Error("Add a photo.");
  }
  if (id) {
    await getPrisma().artist.update({ where: { id }, data });
  } else {
    await getPrisma().artist.create({ data });
  }
  revalidatePath("/artists");
  revalidatePath("/");
  redirect("/portal/artists");
}

export async function deleteArtist(formData: FormData) {
  const id = text(formData, "id");
  await getPrisma().artist.delete({ where: { id } });
  revalidatePath("/artists");
  revalidatePath("/");
  redirect("/portal/artists");
}

export async function saveNews(formData: FormData) {
  const id = text(formData, "id");
  const title = text(formData, "title");
  const slug = slugify(text(formData, "slug") || title);
  const coverImage = await savePhoto(formData, "coverImage");
  const existing = id
    ? await getPrisma().newsPost.findUnique({ where: { id } })
    : null;
  const artistId = text(formData, "artistId") || null;
  const data = {
    slug,
    title,
    excerpt: text(formData, "excerpt"),
    body: bodyFromTextarea(text(formData, "body")),
    publishedAt: new Date(text(formData, "publishedAt") || Date.now()),
    published: checked(formData, "published"),
    artistId,
    coverImage: coverImage || existing?.coverImage || null,
  };
  if (id) {
    await getPrisma().newsPost.update({ where: { id }, data });
  } else {
    await getPrisma().newsPost.create({ data });
  }
  revalidatePath("/news");
  redirect("/portal/news");
}

export async function deleteNews(formData: FormData) {
  await getPrisma().newsPost.delete({ where: { id: text(formData, "id") } });
  revalidatePath("/news");
  redirect("/portal/news");
}

export async function saveEvent(formData: FormData) {
  const id = text(formData, "id");
  const title = text(formData, "title");
  const slug = slugify(text(formData, "slug") || title);
  const image = await savePhoto(formData, "image");
  const existing = id
    ? await getPrisma().event.findUnique({ where: { id } })
    : null;
  const data = {
    slug,
    title,
    venue: text(formData, "venue") || null,
    city: text(formData, "city") || null,
    startsAt: new Date(text(formData, "startsAt") || Date.now()),
    description: text(formData, "description"),
    ticketUrl: text(formData, "ticketUrl") || null,
    published: checked(formData, "published"),
    image: image || existing?.image || null,
  };
  if (id) {
    await getPrisma().event.update({ where: { id }, data });
  } else {
    await getPrisma().event.create({ data });
  }
  revalidatePath("/events");
  redirect("/portal/events");
}

export async function deleteEvent(formData: FormData) {
  await getPrisma().event.delete({ where: { id: text(formData, "id") } });
  revalidatePath("/events");
  redirect("/portal/events");
}

export async function saveJob(formData: FormData) {
  const id = text(formData, "id");
  const title = text(formData, "title");
  const slug = slugify(text(formData, "slug") || title);
  const data = {
    slug,
    title,
    description: text(formData, "description"),
    location: text(formData, "location"),
    published: checked(formData, "published"),
  };
  if (id) {
    await getPrisma().job.update({ where: { id }, data });
  } else {
    await getPrisma().job.create({ data });
  }
  revalidatePath("/careers");
  redirect("/portal/jobs");
}

export async function deleteJob(formData: FormData) {
  await getPrisma().job.delete({ where: { id: text(formData, "id") } });
  revalidatePath("/careers");
  redirect("/portal/jobs");
}

export async function markInquiryRead(formData: FormData) {
  await getPrisma().inquiry.update({
    where: { id: text(formData, "id") },
    data: { readAt: new Date() },
  });
  revalidatePath("/portal/inquiries");
}
