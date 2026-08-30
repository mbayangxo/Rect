import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplyForm } from "@/components/apply-form";
import { PageFrame } from "@/components/page-frame";
import { getJob } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/careers/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const job = await getJob(slug);
  return { title: job?.title ?? "Apply" };
}

export default async function JobApplyPage({
  params,
}: PageProps<"/careers/[slug]">) {
  const { slug } = await params;
  const job = await getJob(slug);
  if (!job || !job.published) {
    notFound();
  }

  return (
    <PageFrame>
      <p className="text-sm uppercase tracking-[0.16em] text-white/60">{job.location}</p>
      <h1 className="mt-2 font-display text-6xl tracking-[0.08em] uppercase sm:text-8xl">
        {job.title}
      </h1>
      <p className="mt-6 max-w-xl whitespace-pre-wrap text-lg text-white/80">{job.description}</p>
      <ApplyForm jobSlug={job.slug} />
    </PageFrame>
  );
}
