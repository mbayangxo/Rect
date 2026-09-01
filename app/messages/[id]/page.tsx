import { notFound, redirect } from "next/navigation";
import { MessageThreadClient } from "@/app/messages/[id]/thread-client";
import { loadUsersAreBlocked } from "@/lib/dashboard/blocks";
import { loadDmThread, markDmRead } from "@/lib/dashboard/dms";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function MessageThreadPage({ params }: Props) {
  const { id } = await params;
  const conversationId = id?.trim();
  if (!conversationId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/messages/${conversationId}`);
  }

  const result = await loadDmThread(supabase, user.id, conversationId);
  if (result.notParticipant) notFound();

  if (!result.missingTable && !result.error) {
    await markDmRead(supabase, conversationId);
  }

  let blocked = false;
  if (result.other_id) {
    const b = await loadUsersAreBlocked(supabase, user.id, result.other_id);
    blocked = b.blocked;
  }

  return (
    <MessageThreadClient
      conversationId={conversationId}
      otherId={result.other_id}
      otherName={result.other_name}
      otherAvatar={result.other_avatar}
      initialMessages={result.messages}
      missingTable={result.missingTable}
      loadError={result.error}
      blocked={blocked}
    />
  );
}
