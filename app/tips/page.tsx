import { redirect } from "next/navigation";
import { TipsClient } from "@/app/tips/tips-client";
import { loadMyTips } from "@/lib/dashboard/tips";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TipsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/tips");
  }

  const result = await loadMyTips(supabase, user.id);

  return (
    <TipsClient
      tips={result.tips}
      totalXof={result.totalXof}
      loadError={result.error}
      missingTable={result.missingTable}
    />
  );
}
