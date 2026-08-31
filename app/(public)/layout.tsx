import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:bg-lime focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <SiteHeader />
      <div id="content" className="flex flex-1 flex-col">
        {children}
      </div>
      <SiteFooter />
    </>
  );
}
