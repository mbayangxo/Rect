import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/releases", label: "Releases" },
  { href: "/dashboard/releases/new", label: "New release" },
  { href: "/dashboard/delivery", label: "Delivery center" },
];

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-taali-border bg-taali-surface p-6">
        <Link href="/" className="mb-8 block">
          <span className="text-xl font-semibold tracking-tight text-taali-accent">
            Taali
          </span>
          <span className="mt-1 block text-xs text-taali-muted">
            Distribution rail
          </span>
        </Link>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-taali-surface-elevated hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-10 text-xs text-taali-muted">
          Phase 1 · RECT handoff
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-background p-8">{children}</main>
    </div>
  );
}
