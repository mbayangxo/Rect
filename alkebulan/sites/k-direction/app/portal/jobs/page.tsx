import Link from "next/link";
import { deleteJob } from "@/lib/portal-actions";
import { getPrisma } from "@/lib/db";

export const metadata = { title: "Jobs" };

export default async function PortalJobsPage() {
  const jobs = await getPrisma().job.findMany({
    orderBy: { title: "asc" },
    include: { _count: { select: { applications: true } } },
  });
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Jobs</h1>
        <Link href="/portal/jobs/new" className="bg-lime px-4 py-2 font-display text-ink uppercase">
          Add job
        </Link>
      </div>
      <ul className="mt-8 grid gap-4">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 border border-white/15 p-4">
            <div>
              <p className="font-display text-2xl uppercase">{job.title}</p>
              <p className="text-sm text-white/60">{job._count.applications} applications</p>
            </div>
            <div className="flex gap-3">
              <Link href={`/portal/jobs/${job.id}`} className="text-lime uppercase">
                Open
              </Link>
              <form action={deleteJob}>
                <input type="hidden" name="id" value={job.id} />
                <button className="uppercase text-pink">Remove</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
