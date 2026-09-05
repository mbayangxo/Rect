import { StudioNav } from "@/components/studio/studio-nav";

type Props = {
  displayName: string;
  ownsLabel?: boolean;
  children: React.ReactNode;
};

export function StudioShell({
  displayName,
  ownsLabel = false,
  children,
}: Props) {
  return (
    <div className="flex min-h-dvh bg-[#040d06] text-[#f8f8f8]">
      <StudioNav displayName={displayName} ownsLabel={ownsLabel} />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <main className="relative flex-1 overflow-x-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-[var(--rect)]/10 blur-[100px]"
          />
          <div className="relative mx-auto w-full max-w-3xl px-5 py-8 sm:px-6 sm:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
