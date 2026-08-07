import Link from "next/link";
import { redirect } from "next/navigation";
import { RectLogo } from "@/components/rect-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/dashboard");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("display_name, role, city")
    .eq("id", user.id)
    .maybeSingle();

  const displayName =
    profile?.display_name ||
    (typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null) ||
    user.email;

  const role =
    profile?.role ||
    (typeof user.user_metadata?.role === "string"
      ? user.user_metadata.role
      : "fan");

  return (
    <main className="min-h-screen bg-[#040d06] px-4 py-10 text-[#f8f8f8]">
      <div className="mx-auto w-full max-w-[400px] space-y-6">
        <div className="flex items-center justify-between">
          <RectLogo size={40} />
          <SignOutButton />
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#1DB954]">
            Dashboard
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Welcome, {displayName}
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Account type: <span className="text-white/80">{role}</span>
          </p>
          <p className="mt-1 text-xs text-white/35">{user.email}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href="/"
            className="rounded-full bg-[#1DB954] py-3 text-center text-sm font-semibold text-black hover:bg-[#17a349]"
          >
            Go to home
          </Link>
          {role === "artist" ? (
            <Link
              href="/artist/upload"
              className="rounded-full border border-white/15 py-3 text-center text-sm font-medium text-white hover:border-white/30"
            >
              Upload a track
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
