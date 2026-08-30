"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArtistProfileForm } from "@/components/artist-profile-form";
import type { StudioPortalProfile } from "@/lib/studio/require-artist";

type Props = {
  artistId: string;
  profile: StudioPortalProfile;
  emphasizeSetup?: boolean;
};

export function StudioPortalEditor({
  artistId,
  profile,
  emphasizeSetup = false,
}: Props) {
  const router = useRouter();
  const bannerRef = useRef<HTMLInputElement>(null);
  const [bannerUrl, setBannerUrl] = useState(profile.bannerUrl);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  async function onBannerPick(file: File | null) {
    if (!file || uploadingBanner) return;
    setBannerError(null);
    setUploadingBanner(true);
    try {
      const body = new FormData();
      body.append("banner", file);
      const res = await fetch("/api/artist/banner", { method: "POST", body });
      const data = (await res.json()) as {
        error?: string;
        banner_url?: string;
      };
      if (!res.ok || data.error || !data.banner_url) {
        setBannerError(data.error || "Could not upload banner.");
        return;
      }
      setBannerUrl(data.banner_url);
      router.refresh();
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : "Network error");
    } finally {
      setUploadingBanner(false);
      if (bannerRef.current) bannerRef.current.value = "";
    }
  }

  async function removeBanner() {
    if (uploadingBanner || !bannerUrl) return;
    setUploadingBanner(true);
    setBannerError(null);
    try {
      const res = await fetch("/api/artist/banner", { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setBannerError(data.error || "Could not remove banner.");
        return;
      }
      setBannerUrl(null);
      router.refresh();
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : "Network error");
    } finally {
      setUploadingBanner(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Fan preview
        </h2>
        <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
          <div className="relative h-28 bg-gradient-to-br from-[#1DB954]/20 to-black/40">
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="relative px-4 pb-4">
            <div className="-mt-8 flex items-end gap-3">
              <span className="relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-[#040d06] bg-[#1DB954]/20">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-[#1DB954]">
                    {profile.displayName.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
              <div className="min-w-0 pb-1">
                <p className="truncate font-semibold">{profile.displayName}</p>
                <p className="truncate text-xs text-white/45">
                  {profile.genres.slice(0, 2).join(" · ") || "Add genres"}
                  {profile.countries[0]
                    ? ` · ${profile.countries[0]}`
                    : ""}
                </p>
              </div>
            </div>
            {profile.artistBio ? (
              <p className="mt-3 line-clamp-3 text-sm text-white/55">
                {profile.artistBio}
              </p>
            ) : null}
            <Link
              href={`/artists/${artistId}`}
              className="mt-3 inline-block text-xs text-[#1DB954] hover:underline"
            >
              Open live portal →
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Banner image
        </h2>
        <input
          ref={bannerRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onBannerPick(e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={uploadingBanner}
            onClick={() => bannerRef.current?.click()}
            className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/70 hover:border-[#1DB954]/50 disabled:opacity-50"
          >
            {uploadingBanner
              ? "Uploading…"
              : bannerUrl
                ? "Change banner"
                : "Upload banner"}
          </button>
          {bannerUrl ? (
            <button
              type="button"
              disabled={uploadingBanner}
              onClick={() => void removeBanner()}
              className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/40 hover:text-red-300 disabled:opacity-50"
            >
              Remove
            </button>
          ) : null}
        </div>
        {bannerError ? (
          <p className="mt-2 text-xs text-[#F5A623]">{bannerError}</p>
        ) : null}
      </section>

      <ArtistProfileForm
        displayName={profile.displayName}
        city={profile.city}
        artistBio={profile.artistBio}
        countries={profile.countries}
        genres={profile.genres}
        avatarUrl={profile.avatarUrl}
        publicPortalHref={`/artists/${artistId}`}
        emphasizeSetup={emphasizeSetup}
      />
    </div>
  );
}
