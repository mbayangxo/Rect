import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ focus?: string; setup?: string }>;
};

/** Legacy Studio URL — keep /artist/inbox; send hub traffic to /studio. */
export default async function ArtistLibraryRedirect({ searchParams }: Props) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  if (sp.focus?.trim()) q.set("focus", sp.focus.trim());
  if (sp.setup?.trim()) q.set("setup", sp.setup.trim());
  const qs = q.toString();
  redirect(qs ? `/studio?${qs}` : "/studio");
}
