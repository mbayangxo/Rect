import { site } from "@/content/site";

export function SiteFooter() {
  return (
    <footer className="bg-ink px-4 py-6 text-center font-display text-sm tracking-[0.18em] text-white/80 uppercase sm:px-6">
      {new Date().getFullYear()} © {site.legal} All rights reserved.
    </footer>
  );
}
