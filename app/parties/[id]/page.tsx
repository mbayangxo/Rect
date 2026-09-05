import { notFound, redirect } from "next/navigation";
import { PartyRoomClient } from "@/app/parties/[id]/party-room-client";
import {
  joinParty,
  loadPartyById,
  loadPartyMessages,
  type HostTrackOption,
} from "@/lib/dashboard/listening-parties";
import { createClient } from "@/lib/supabase/server";
import type { TrackRow } from "@/lib/tracks";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function PartyRoomPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=/parties/${id}`);
  }

  const partyRes = await loadPartyById(supabase, id);
  if (partyRes.missingTable) {
    return (
      <main className="min-h-dvh bg-[#040d06] px-5 py-16 text-[#f8f8f8]">
        <p className="text-[#F5A623]">
          Run 20260903_listening_parties.sql in RECT Supabase.
        </p>
      </main>
    );
  }
  if (!partyRes.party) notFound();

  await joinParty(supabase, id, user.id);
  const messages = await loadPartyMessages(supabase, id);

  const isHost = partyRes.party.host_id === user.id;

  let track: TrackRow | null = null;
  if (partyRes.party.track_id) {
    const { data } = await supabase
      .from("tracks")
      .select(
        "id, title, audio_url, cover_art_url, genre, artist_id, duration_secs, status",
      )
      .eq("id", partyRes.party.track_id)
      .maybeSingle();
    track = (data as TrackRow) ?? null;
  }

  let hostTracks: HostTrackOption[] = [];
  if (isHost && !track) {
    const { data } = await supabase
      .from("tracks")
      .select("id, title, cover_art_url, audio_url, status")
      .eq("artist_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);
    hostTracks = (data ?? []) as HostTrackOption[];
  }

  return (
    <PartyRoomClient
      party={partyRes.party}
      initialMessages={messages.messages}
      track={track}
      userId={user.id}
      isHost={isHost}
      hostTracks={hostTracks}
    />
  );
}
