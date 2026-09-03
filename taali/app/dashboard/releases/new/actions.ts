"use server";

import { redirect } from "next/navigation";
import { createRelease } from "@/lib/taali/releases";
import type { CreateReleaseBody } from "@/lib/taali/types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createReleaseAction(formData: FormData) {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error("Supabase is not configured.");
  }

  const title = String(formData.get("title") || "").trim();
  const organizationId = String(formData.get("organization_id") || "").trim();
  const releaseType = String(formData.get("release_type") || "single");
  const rectExternalId = String(formData.get("rect_external_id") || "").trim();

  const trackTitles = formData.getAll("track_title").map((v) => String(v).trim());
  const trackIsrcs = formData.getAll("track_isrc").map((v) => String(v).trim());
  const trackUrls = formData.getAll("track_audio_url").map((v) => String(v).trim());

  if (!title || !organizationId) {
    throw new Error("Title and organization ID are required.");
  }

  const tracks = trackTitles
    .map((trackTitle, index) => ({
      title: trackTitle,
      track_number: index + 1,
      isrc: trackIsrcs[index] || null,
      audio_url: trackUrls[index] || null,
    }))
    .filter((track) => track.title);

  const body: CreateReleaseBody = {
    title,
    organization_id: organizationId,
    release_type: releaseType as CreateReleaseBody["release_type"],
    rect_external_id: rectExternalId || null,
    tracks,
  };

  const { error } = await createRelease(admin, body);
  if (error) {
    throw new Error(error.message);
  }

  redirect("/dashboard/releases");
}
