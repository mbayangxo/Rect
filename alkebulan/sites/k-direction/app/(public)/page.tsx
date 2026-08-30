import { HomeCollage } from "@/components/home-collage";
import { Logo } from "@/components/logo";
import { getArtists, getSettings } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [settings, artists] = await Promise.all([getSettings(), getArtists()]);
  const featured = artists[0] ?? null;

  return (
    <main className="relative flex-1 overflow-hidden bg-[linear-gradient(165deg,#ff8fb8_0%,#c084fc_42%,#dcff00_100%)]">
      <div className="mx-auto grid min-h-[calc(100vh-9rem)] w-full max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-6">
        <div className="relative z-10 drop-shadow-[0_8px_0_rgba(0,0,0,0.35)]">
          <Logo href={null} size="hero" tone="light" />
          <p className="mt-6 max-w-sm text-base font-medium text-ink sm:text-lg">
            {settings.mission}
          </p>
        </div>
        <HomeCollage artist={featured} label={settings.name} />
      </div>
    </main>
  );
}
