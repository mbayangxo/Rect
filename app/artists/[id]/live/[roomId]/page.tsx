import { notFound, redirect } from "next/navigation";
import { LiveRoomClient } from "@/app/artists/[id]/live/[roomId]/live-room-client";
import {
  loadLiveRoomById,
  loadLiveRoomMessages,
  loadLiveRoomPhotos,
} from "@/lib/dashboard/live-rooms";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; roomId: string }>;
  searchParams: Promise<{ host?: string }>;
};

export default async function ArtistLiveRoomPage({
  params,
  searchParams,
}: Props) {
  const { id: artistId, roomId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roomRes = await loadLiveRoomById(supabase, roomId);
  if (roomRes.missingTable) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#040d06] px-5 text-center text-white">
        <p className="text-sm text-[#F5A623]">
          Run 20260830_live_rooms.sql then 20260830_live_rooms_hardening.sql in
          Supabase, then refresh.
        </p>
      </main>
    );
  }
  if (!roomRes.room || roomRes.room.artist_id !== artistId) notFound();

  const room = roomRes.room;
  const isHost = Boolean(user && user.id === room.artist_id);

  if (!user && room.status === "live") {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/artists/${artistId}/live/${roomId}`)}`,
    );
  }

  if (sp.host === "1" && user && !isHost) {
    redirect(`/artists/${artistId}/live/${roomId}`);
  }

  // Private rooms: only owner
  if (room.visibility === "private" && !isHost) {
    notFound();
  }

  const { data: artist } = await supabase
    .from("users")
    .select("display_name, avatar_url")
    .eq("id", artistId)
    .maybeSingle();

  const [messages, photos] = await Promise.all([
    loadLiveRoomMessages(supabase, roomId),
    loadLiveRoomPhotos(supabase, roomId),
  ]);

  return (
    <LiveRoomClient
      room={room}
      artistName={
        (typeof artist?.display_name === "string" && artist.display_name) ||
        "Artist"
      }
      artistAvatar={
        typeof artist?.avatar_url === "string" ? artist.avatar_url : null
      }
      initialMessages={messages}
      initialPhotos={photos}
      viewerId={user?.id ?? null}
      isHost={isHost}
      fanClubHref={`/artists/${artistId}#fan-club`}
    />
  );
}
