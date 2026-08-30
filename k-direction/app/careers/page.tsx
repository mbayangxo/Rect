import type { Metadata } from "next";
import { PageFrame } from "@/components/page-frame";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Careers",
};

export default function CareersPage() {
  return (
    <PageFrame>
      <h1 className="font-display text-6xl tracking-[0.12em] uppercase sm:text-8xl">
        Careers
      </h1>
      <p className="mt-8 max-w-lg text-lg">
        No open roles right now. Send inquiries to{" "}
        <a className="text-lime underline" href={`mailto:${site.emails.inquiries}`}>
          {site.emails.inquiries}
        </a>
        .
      </p>
    </PageFrame>
  );
}
