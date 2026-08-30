import Link from "next/link";
import { formatDate } from "@/lib/catalog";
import { getPrisma } from "@/lib/db";
import { portalResumeHref } from "@/lib/uploads";

export const metadata = { title: "Applications" };

export default async function PortalApplicationsPage() {
  const applications = await getPrisma().jobApplication.findMany({
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });

  return (
    <div>
      <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Applications</h1>
      <p className="mt-3 max-w-xl text-white/70">
        People apply on Careers. Resumes stay in the portal — they are not public files.
      </p>
      {applications.length === 0 ? (
        <p className="mt-8 text-white/70">No applications yet.</p>
      ) : (
        <ul className="mt-8 grid gap-4">
          {applications.map((app) => (
            <li key={app.id} className="border border-white/15 p-4">
              <p className="font-display text-xl uppercase">
                {app.firstName} {app.lastName}
              </p>
              <p className="text-sm text-white/60">
                {app.job.title} · {app.email} · {formatDate(app.createdAt)}
              </p>
              {app.note ? <p className="mt-2 text-white/80">{app.note}</p> : null}
              <p className="mt-3 flex flex-wrap gap-4">
                <a className="text-lime underline" href={portalResumeHref(app.resumePath)} target="_blank" rel="noreferrer">
                  View resume
                </a>
                <Link className="uppercase text-white/60" href={`/portal/jobs/${app.jobId}`}>
                  Open job
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
