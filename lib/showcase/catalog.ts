import type { RankedTrack } from "@/lib/dashboard/tracks";
import type { TrackRow } from "@/lib/tracks";

/**
 * Showcase catalog — professional fake artists / songs / lyrics for empty
 * environments and UI QA. Not filtered by isDemoTrack (those titles avoid
 * SoundHelix naming). Audio uses public sample MP3s.
 */

export type ShowcaseArtist = {
  id: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  countries: string[];
  genres: string[];
};

export type ShowcaseTrack = TrackRow & {
  play_count: number;
  like_count: number;
  artist_name: string;
};

const AUDIO = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3",
] as const;

function cover(seed: string) {
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0a1a12,1a2e22,c4a35a`;
}

function avatar(seed: string) {
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0a1a12`;
}

export const SHOWCASE_ARTISTS: ShowcaseArtist[] = [
  {
    id: "showcase-amayel",
    display_name: "Amayel Ndiaye",
    avatar_url: avatar("amayel-ndiaye"),
    bio: "Mbalax-rooted songwriter from Médina. Soft nights, hard drums.",
    countries: ["Senegal", "Dakar"],
    genres: ["Mbalax", "Afro-Soul"],
  },
  {
    id: "showcase-kofi",
    display_name: "Kofi Mensah",
    avatar_url: avatar("kofi-mensah"),
    bio: "Accra highlife for the late shift — warm brass, patient grooves.",
    countries: ["Ghana"],
    genres: ["Highlife", "Afrobeats"],
  },
  {
    id: "showcase-zuri",
    display_name: "Zuri Okoro",
    avatar_url: avatar("zuri-okoro"),
    bio: "Lagos alt-R&B. Quiet verses that still take the room.",
    countries: ["Nigeria"],
    genres: ["Afro-R&B", "Alt"],
  },
  {
    id: "showcase-sira",
    display_name: "Sira Diallo",
    avatar_url: avatar("sira-diallo"),
    bio: "Bamako voice over desert pulse — languages braided into melody.",
    countries: ["Mali"],
    genres: ["Desert Blues", "Folk"],
  },
];

const LYRICS: Record<string, string> = {
  "teranga-nights": `Street light on the corner still waiting
Teranga in the way we say goodnight
Hold the rhythm, leave the worry
Dakar keeps the tempo right

Chorus
We move soft but we move sure
Hands in the air for the ones before
Teranga nights, open door
One more song then we need one more`,
  "accra-gold": `Brass in the alley, market still loud
Gold in the pocket of a borrowed cloud
Call my name when the sun goes down
Accra keeps the promise I found

Chorus
Highlife heart, steady feet
Every corner got a song to keep
Accra gold, never cheap
Dance until the morning heat`,
  "quiet-room": `Curtain half drawn, city outside
You speak in half-tones I can't hide
Lagos hush between the lines
Love like a room with soft designs

Chorus
Quiet room, louder truth
I hear you clearer when we lose the proof
Stay a while, don't need a booth
Just the bass and the two of us`,
  "sahel-line": `Dust on the string, river far below
Words in Fulani, words we know
Walk the Sahel line until we sleep
Carry every story that we keep

Chorus
Fire low, sky wide
Nothing rushing on this ride
Sahel line, side by side
Stars for a map we never hide`,
  "medina-run": `Scooter past the mural, heart on run
Médina mornings under yellow sun
Catch the chorus from a window frame
Everyone knows this city's name`,
  "lagos-wire": `Wire between the towers humming low
Night bus lullaby, neon glow
Zuri on the corner counting time
Every missed call still finds a rhyme`,
};

function track(opts: {
  id: string;
  title: string;
  artist: ShowcaseArtist;
  genre: string;
  language: string;
  audioIndex: number;
  lyricsKey: string;
  play_count: number;
  like_count: number;
  duration_secs: number;
}): ShowcaseTrack {
  return {
    id: opts.id,
    title: opts.title,
    audio_url: AUDIO[opts.audioIndex % AUDIO.length]!,
    cover_art_url: cover(opts.id),
    genre: opts.genre,
    language: opts.language,
    artist_id: opts.artist.id,
    artist_name: opts.artist.display_name,
    duration_secs: opts.duration_secs,
    status: "live",
    created_at: "2026-08-01T12:00:00.000Z",
    lyrics: LYRICS[opts.lyricsKey] ?? null,
    content_kind: "music",
    play_count: opts.play_count,
    like_count: opts.like_count,
  };
}

export const SHOWCASE_TRACKS: ShowcaseTrack[] = [
  track({
    id: "showcase-track-teranga",
    title: "Teranga Nights",
    artist: SHOWCASE_ARTISTS[0]!,
    genre: "Mbalax",
    language: "Wolof",
    audioIndex: 0,
    lyricsKey: "teranga-nights",
    play_count: 18420,
    like_count: 942,
    duration_secs: 214,
  }),
  track({
    id: "showcase-track-medina",
    title: "Médina Run",
    artist: SHOWCASE_ARTISTS[0]!,
    genre: "Afro-Soul",
    language: "French",
    audioIndex: 1,
    lyricsKey: "medina-run",
    play_count: 12011,
    like_count: 610,
    duration_secs: 198,
  }),
  track({
    id: "showcase-track-accra",
    title: "Accra Gold",
    artist: SHOWCASE_ARTISTS[1]!,
    genre: "Highlife",
    language: "English",
    audioIndex: 2,
    lyricsKey: "accra-gold",
    play_count: 22104,
    like_count: 1102,
    duration_secs: 232,
  }),
  track({
    id: "showcase-track-quiet",
    title: "Quiet Room",
    artist: SHOWCASE_ARTISTS[2]!,
    genre: "Afro-R&B",
    language: "English",
    audioIndex: 3,
    lyricsKey: "quiet-room",
    play_count: 15660,
    like_count: 880,
    duration_secs: 205,
  }),
  track({
    id: "showcase-track-wire",
    title: "Lagos Wire",
    artist: SHOWCASE_ARTISTS[2]!,
    genre: "Alt",
    language: "English",
    audioIndex: 4,
    lyricsKey: "lagos-wire",
    play_count: 9804,
    like_count: 501,
    duration_secs: 189,
  }),
  track({
    id: "showcase-track-sahel",
    title: "Sahel Line",
    artist: SHOWCASE_ARTISTS[3]!,
    genre: "Desert Blues",
    language: "Bambara",
    audioIndex: 5,
    lyricsKey: "sahel-line",
    play_count: 14220,
    like_count: 733,
    duration_secs: 248,
  }),
];

export function isShowcaseId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith("showcase-"));
}

export function getShowcaseArtist(id: string): ShowcaseArtist | null {
  return SHOWCASE_ARTISTS.find((a) => a.id === id) ?? null;
}

export function getShowcaseTrack(id: string): ShowcaseTrack | null {
  return SHOWCASE_TRACKS.find((t) => t.id === id) ?? null;
}

export function showcaseTracksForArtist(artistId: string): ShowcaseTrack[] {
  return SHOWCASE_TRACKS.filter((t) => t.artist_id === artistId);
}

/** Use when live catalog is empty so Discover / Home still look finished. */
export function showcaseAsRanked(limit = 12): RankedTrack[] {
  return SHOWCASE_TRACKS.slice(0, limit).map((t) => ({ ...t }));
}
