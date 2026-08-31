import { getSettings } from "@/lib/catalog";

export async function SiteFooter() {
  const settings = await getSettings();
  return (
    <footer className="bg-ink px-4 py-6 text-center font-display text-sm tracking-[0.18em] text-white/80 uppercase sm:px-6">
      {new Date().getFullYear()} © {settings.legal} All rights reserved.
      {settings.kebuUrl ? (
        <>
          {" "}
          ·{" "}
          <a className="text-lime" href={settings.kebuUrl}>
            Kebu
          </a>
        </>
      ) : null}
    </footer>
  );
}
