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
      <p className="max-w-3xl font-display text-5xl leading-[0.95] tracking-[0.04em] uppercase sm:text-7xl">
        {site.mission}
      </p>
      <p className="mt-10 max-w-md text-white/70">{site.legal}</p>
    </PageFrame>
  );
}
