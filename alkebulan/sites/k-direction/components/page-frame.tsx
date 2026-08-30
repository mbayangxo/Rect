type PageFrameProps = {
  tone?: "lime" | "dark";
  children: React.ReactNode;
};

export function PageFrame({ tone = "dark", children }: PageFrameProps) {
  const surface = tone === "lime" ? "bg-lime text-ink" : "bg-ink text-white";
  return (
    <main className={`flex-1 ${surface}`}>
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {children}
      </div>
    </main>
  );
}
