import Link from "next/link";
import { saveJob } from "@/lib/portal-actions";
import { getPrisma } from "@/lib/db";
import { formatDate } from "@/lib/catalog";
import { portalResumeHref } from "@/lib/uploads";
import { notFound } from "next/navigation";

export const metadata = { title: "Job" };

export default async function PortalJobPage({
  params,
}: PageProps<"/portal/jobs/[id]">) {
  const { id } = await params;
  if (id === "new") {
    return (
      <div>
        <h1 className="font-display text-5xl tracking-[0.1em] uppercase">Add job</h1>
        <JobForm />
      </div>
    );
  }
  const job = await getPrisma().job.findUnique({
    where: { id },
    include: { applications: { orderBy: { createdAt: "desc" } } },
  });
  if (!job) {
    notFound();
  }

  return (
    <div>
      <h1 className="font-display text-5xl tracking-[0.1em] uppercase">{job.title}</h1>
      <JobForm
        id={job.id}
        title={job.title}
        slug={job.slug}
        location={job.location}
        description={job.description}
        published={job.published}
      />
      <h2 className="mt-12 font-display text-3xl uppercase">Applications</h2>
      {job.applications.length === 0 ? (
        <p className="mt-4 text-white/70">No applications yet.</p>
      ) : (
        <ul className="mt-4 grid gap-4">
          {job.applications.map((app) => (
            <li key={app.id} className="border border-white/15 p-4">
              <p className="font-display text-xl uppercase">
                {app.firstName} {app.lastName}
              </p>
              <p className="text-sm text-white/60">
                {app.email} · {formatDate(app.createdAt)}
              </p>
              {app.note ? <p className="mt-2 text-white/80">{app.note}</p> : null}
              <p className="mt-3">
                <a className="text-lime underline" href={portalResumeHref(app.resumePath)} target="_blank" rel="noreferrer">
                  View resume
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8">
        <Link href="/portal/jobs" className="uppercase text-white/60">
          Back to jobs
        </Link>
      </p>
    </div>
  );
}

function JobForm(props: {
  id?: string;
  title?: string;
  slug?: string;
  location?: string;
  description?: string;
  published?: boolean;
}) {
  return (
    <form action={saveJob} className="mt-8 grid max-w-xl gap-4">
      {props.id ? <input type="hidden" name="id" value={props.id} /> : null}
      <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
        Title
        <input name="title" required defaultValue={props.title ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
      </label>
      <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
        Slug
        <input name="slug" defaultValue={props.slug ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
      </label>
      <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
        Location
        <input name="location" defaultValue={props.location ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
      </label>
      <label className="grid gap-2 text-sm uppercase tracking-[0.14em]">
        Description
        <textarea name="description" rows={6} defaultValue={props.description ?? ""} className="normal-case border border-white/30 bg-transparent px-3 py-2" />
      </label>
      <label className="flex items-center gap-2 text-sm uppercase tracking-[0.14em]">
        <input name="published" type="checkbox" defaultChecked={props.published ?? true} />
        Published
      </label>
      <button className="justify-self-start bg-lime px-6 py-3 font-display text-2xl text-ink uppercase">
        Save
      </button>
    </form>
  );
}
