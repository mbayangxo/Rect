import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/page-frame";
import { getPublishedJobs, getSettings } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Careers",
};

export default async function CareersPage() {
  const [jobs, settings] = await Promise.all([getPublishedJobs(), getSettings()]);

  return (
    <PageFrame>
      <h1 className="font-display text-6xl tracking-[0.12em] uppercase sm:text-8xl">
        Careers
      </h1>
      {jobs.length === 0 ? (
        <p className="mt-8 max-w-lg text-lg">
          No open roles right now. Send inquiries through{" "}
          <Link className="text-lime underline" href="/contact">
            contact
          </Link>{" "}
          or {settings.inquiriesEmail}.
        </p>
      ) : (
        <ul className="mt-10 grid max-w-2xl gap-8">
          {jobs.map((job) => (
            <li key={job.id} className="border border-white/20 p-6">
              <h2 className="font-display text-4xl tracking-[0.08em] uppercase">
                {job.title}
              </h2>
              {job.location ? <p className="mt-1 text-white/60">{job.location}</p> : null}
              <p className="mt-3 whitespace-pre-wrap text-white/80">{job.description}</p>
              <p className="mt-4">
                <Link href={`/careers/${job.slug}`} className="font-display text-xl text-lime uppercase">
                  Apply
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
