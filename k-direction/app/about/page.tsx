import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "About us",
};

export default function AboutPage() {
  return (
    <PageFrame>
      <h1 className="sr-only">About us</h1>
      <p className="font-display text-[clamp(5.5rem,18vw,10rem)] leading-none tracking-[0.06em] uppercase">
        A
      </p>
      <p className="mt-6 max-w-xl font-display text-3xl leading-[1.05] tracking-[0.08em] uppercase sm:text-5xl">
        recording label focused on cultivating and supporting talent.
      </p>
      <p className="mt-10 max-w-md text-white/70">{site.legal}</p>
    </PageFrame>
  );
}
