import { redirect } from "next/navigation";
import { MessagesListClient } from "@/app/messages/messages-client";
import { loadDmThreads } from "@/lib/dashboard/dms";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/messages");
  }

  const result = await loadDmThreads(supabase, user.id);

  return (
    <MessagesListClient
      threads={result.threads}
      missingTable={result.missingTable}
      loadError={result.error}
    />
  );
}
