import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { getSettings } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "About us",
};

export default async function AboutPage() {
  const settings = await getSettings();
  const mission = settings.mission.replace(/^A\s+/i, "");

  return (
    <PageFrame>
      <h1 className="sr-only">About us</h1>
      <p className="font-display text-[clamp(5.5rem,18vw,10rem)] leading-none tracking-[0.06em] uppercase">
        A
      </p>
      <p className="mt-6 max-w-xl font-display text-3xl leading-[0.95] tracking-[0.08em] uppercase sm:text-5xl">
        {mission}
      </p>
      <p className="mt-10 max-w-md text-white/70">{settings.legal}</p>
    </PageFrame>
  );
}
