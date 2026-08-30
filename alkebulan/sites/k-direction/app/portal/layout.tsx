import { PortalNav } from "@/components/portal-nav";
import { isPortalAuthed } from "@/lib/portal-auth";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const authed = await isPortalAuthed();
  return (
    <div className="flex min-h-full flex-col bg-ink text-white">
      {authed ? <PortalNav /> : null}
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</div>
    </div>
  );
}
