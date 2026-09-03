import { createReleaseAction } from "./actions";

export default function NewReleasePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">New release</h1>
        <p className="mt-1 text-sm text-taali-muted">
          Create a catalog package manually or mirror a RECT handoff.
        </p>
      </div>

      <form
        action={createReleaseAction}
        className="space-y-6 rounded-xl border border-taali-border bg-taali-surface p-6"
      >
        <Field label="Title">
          <input
            required
            name="title"
            className="w-full rounded-lg border border-taali-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-taali-accent"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Release type">
            <select
              name="release_type"
              defaultValue="single"
              className="w-full rounded-lg border border-taali-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-taali-accent"
            >
              <option value="single">Single</option>
              <option value="ep">EP</option>
              <option value="album">Album</option>
              <option value="compilation">Compilation</option>
            </select>
          </Field>
          <Field label="Organization ID">
            <input
              required
              name="organization_id"
              placeholder="UUID from Taali org"
              className="w-full rounded-lg border border-taali-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-taali-accent"
            />
          </Field>
        </div>

        <Field label="RECT external ID (optional)">
          <input
            name="rect_external_id"
            placeholder="distribution_releases.id from RECT"
            className="w-full rounded-lg border border-taali-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-taali-accent"
          />
        </Field>

        <div className="space-y-4">
          <h2 className="text-sm font-medium text-white">Tracks</h2>
          <TrackFields index={0} />
          <TrackFields index={1} optional />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-taali-accent px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-taali-accent-dim"
        >
          Create release
        </button>
      </form>
    </div>
  );
}

function TrackFields({
  index,
  optional,
}: {
  index: number;
  optional?: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-taali-border bg-background/60 p-4 sm:grid-cols-2">
      <Field label={`Track ${index + 1} title`}>
        <input
          name="track_title"
          required={!optional}
          className="w-full rounded-lg border border-taali-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-taali-accent"
        />
      </Field>
      <Field label="ISRC">
        <input
          name="track_isrc"
          className="w-full rounded-lg border border-taali-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-taali-accent"
        />
      </Field>
      <Field label="Audio URL" className="sm:col-span-2">
        <input
          name="track_audio_url"
          className="w-full rounded-lg border border-taali-border bg-background px-3 py-2 text-sm text-white outline-none focus:border-taali-accent"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className ?? ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-taali-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
