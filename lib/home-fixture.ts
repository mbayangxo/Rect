/** UI fixture data for RECT SOUND shell. Not production persistence. */

export const MOVES = ["Push", "Amplify", "Lock In", "Back", "Mark"] as const;
export const MOVE_ICONS = ["🔥", "📡", "🔒", "💚", "📍"] as const;

export const HUB_EXITS = ["Screen", "Rectangl", "Market", "Passport"] as const;

export type Track = {
  artist: string;
  song: string;
  genre: string;
  color: string;
  grad: string;
  emoji: string;
  listeners: string;
  chart: string;
};

export const TRACKS: Track[] = [
  {
    artist: "VJ",
    song: "Kay Way",
    genre: "Hip-Hop · Dakar",
    color: "#1DB954",
    grad: "linear-gradient(160deg,#0B2B18 0%,#040d06 100%)",
    emoji: "🎤",
    listeners: "2,847",
    chart: "#1 DAKAR · 127K STREAMS",
  },
  {
    artist: "May Lécor",
    song: "Birima",
    genre: "Afro-Soul · Dakar",
    color: "#E8821A",
    grad: "linear-gradient(160deg,#2B1A08 0%,#040d06 100%)",
    emoji: "🔥",
    listeners: "1,421",
    chart: "#3 SÉNÉGAL · 87K STREAMS",
  },
  {
    artist: "Wally B.",
    song: "Wi Ma Yëgël",
    genre: "Mbalax · Dakar",
    color: "#1A6BE8",
    grad: "linear-gradient(160deg,#081A2B 0%,#040d06 100%)",
    emoji: "🌊",
    listeners: "3,102",
    chart: "#2 DAKAR · 98K STREAMS",
  },
  {
    artist: "Dip DG",
    song: "Dakar Dem",
    genre: "Rap · Dakar",
    color: "#A01AE8",
    grad: "linear-gradient(160deg,#1A082B 0%,#040d06 100%)",
    emoji: "🌙",
    listeners: "980",
    chart: "#7 DAKAR · 47K STREAMS",
  },
];

export const PORTALS = [
  { n: "VJ", g: "Hip-Hop · Dakar", bg: "pbg1", e: "🎤", f: "2.8K", live: true },
  { n: "May Lécor", g: "Afro-Soul", bg: "pbg2", e: "🔥", f: "1.4K", live: false },
  { n: "Wally B.", g: "Mbalax", bg: "pbg3", e: "🌊", f: "3.1K", live: false },
  { n: "Dip DG", g: "Rap", bg: "pbg4", e: "🌙", f: "980", live: false },
] as const;

export const WORLDS = [
  { n: "Dakar à 3h du matin", by: "DKLN", bg: "wbg1", e: "🌙", f: "12.4K" },
  { n: "Pour ceux qui gardent la foi", by: "Ibou.dkr", bg: "wbg2", e: "🙏", f: "5.2K" },
  { n: "Le Son Qui Voyage", by: "May Lécor", bg: "wbg3", e: "✈️", f: "8.7K" },
  { n: "Avant que tout change", by: "Awa.sn", bg: "wbg4", e: "🍂", f: "3.4K" },
  { n: "Si tu connais, tu sais", by: "DKLN", bg: "wbg5", e: "👑", f: "19K" },
] as const;

export const LIVE = [
  { tag: "LIVE", tc: "lt-live2", t: "VJ live dans son Portal", s: "2,847 watching · gratuit", bg: "lbg1", e: "🎤" },
  { tag: "CHART", tc: "lt-chart2", t: "May Lécor bondit au #3 Sénégal", s: "Meilleure progression semaine", bg: "lbg2", e: "📈" },
  { tag: "PORTAL", tc: "lt-portal2", t: "Nouveau Portal: Wally Ballago", s: "800 fans en 1 heure", bg: "lbg3", e: "🌟" },
  { tag: "IRL", tc: "lt-event2", t: "380 tickets vendus · Vendredi", s: "120 restants · RECT IRL Dakar", bg: "lbg4", e: "🎫" },
  { tag: "MILESTONE", tc: "lt-portal2", t: "VJ atteint 1M streams sur RECT", s: "1er artiste Dakarois", bg: "lbg5", e: "🏆" },
] as const;

export const TREND_REGIONS = ["Dakar", "Sénégal", "West Africa", "Africa"] as const;
export type TrendRegion = (typeof TREND_REGIONS)[number];

export type TrendTrack = {
  song: string;
  artist: string;
  heat: string;
  rise: string;
  emoji: string;
  bg: string;
  trackIndex: number;
  regions: TrendRegion[];
};

export const TRENDING: TrendTrack[] = [
  {
    song: "Kay Way",
    artist: "VJ",
    heat: "12.4K/hr",
    rise: "+184%",
    emoji: "🎤",
    bg: "tbg1",
    trackIndex: 0,
    regions: ["Dakar", "Sénégal", "West Africa", "Africa"],
  },
  {
    song: "Birima",
    artist: "May Lécor",
    heat: "8.1K/hr",
    rise: "+92%",
    emoji: "🔥",
    bg: "tbg2",
    trackIndex: 1,
    regions: ["Dakar", "Sénégal", "West Africa"],
  },
  {
    song: "Wi Ma Yëgël",
    artist: "Wally B.",
    heat: "9.7K/hr",
    rise: "+61%",
    emoji: "🌊",
    bg: "tbg3",
    trackIndex: 2,
    regions: ["Dakar", "Sénégal", "West Africa", "Africa"],
  },
  {
    song: "Dakar Dem",
    artist: "Dip DG",
    heat: "4.2K/hr",
    rise: "+118%",
    emoji: "🌙",
    bg: "tbg4",
    trackIndex: 3,
    regions: ["Dakar", "Sénégal"],
  },
  {
    song: "Ye",
    artist: "Burna Boy",
    heat: "22K/hr",
    rise: "+34%",
    emoji: "🌍",
    bg: "tbg5",
    trackIndex: 0,
    regions: ["West Africa", "Africa"],
  },
  {
    song: "Calm Down",
    artist: "Rema",
    heat: "31K/hr",
    rise: "+21%",
    emoji: "💚",
    bg: "tbg1",
    trackIndex: 1,
    regions: ["West Africa", "Africa"],
  },
  {
    song: "Water",
    artist: "Tyla",
    heat: "18K/hr",
    rise: "+47%",
    emoji: "💧",
    bg: "tbg3",
    trackIndex: 2,
    regions: ["Africa"],
  },
  {
    song: "Xarit",
    artist: "Youssou B.",
    heat: "3.6K/hr",
    rise: "+55%",
    emoji: "☀️",
    bg: "tbg2",
    trackIndex: 3,
    regions: ["Dakar", "Sénégal"],
  },
];

export const CHALLENGES = [
  {
    title: "Push Kay Way to #1 Africa",
    meta: "Dakar challenge · 48h left",
    progress: 68,
    fans: "4.2K joined",
    emoji: "🚀",
    accent: "#1DB954",
  },
  {
    title: "Mbalax Marathon",
    meta: "Sénégal · Stream 10 classic cuts",
    progress: 42,
    fans: "1.8K joined",
    emoji: "🥁",
    accent: "#E8821A",
  },
  {
    title: "West Africa Wave",
    meta: "Lock In 5 WA artists this week",
    progress: 25,
    fans: "9.1K joined",
    emoji: "🌊",
    accent: "#1A6BE8",
  },
  {
    title: "Africa Rising Relay",
    meta: "Amplify a new voice from each region",
    progress: 11,
    fans: "12K joined",
    emoji: "🌍",
    accent: "#A01AE8",
  },
] as const;

export const CHART_DATA = [
  { r: 1, s: "Kay Way", a: "VJ", m: "NEW", st: "127K", c: "ca1", t: "KW", pc: "p1" },
  { r: 2, s: "Wi Ma Yëgël", a: "Wally Ballago Seck", m: "+2", st: "98K", c: "ca2", t: "WY", pc: "p2" },
  { r: 3, s: "Birima", a: "May Lécor", m: "+5", st: "87K", c: "ca3", t: "BI", pc: "p3" },
  { r: 4, s: "Ndoumbë", a: "Viviane Chidid", m: "-1", st: "76K", c: "ca4", t: "ND", pc: "" },
  { r: 5, s: "Sara", a: "Pape Diouf", m: "+1", st: "64K", c: "ca5", t: "SA", pc: "" },
  { r: 6, s: "Xarit", a: "Youssou B.", m: "-2", st: "58K", c: "ca6", t: "XA", pc: "" },
  { r: 7, s: "Dakar Dem", a: "Dip DG", m: "+3", st: "47K", c: "ca7", t: "DD", pc: "" },
] as const;

export const FRIENDS = [
  { n: "Moussa", s: "Kay Way", a: "VJ", live: true },
  { n: "Awa", s: "Birima", a: "May Lécor", live: true },
  { n: "Ibou", s: "Sara", a: "Pape Diouf", live: false },
  { n: "Fatou", s: "Wi Ma Yëgël", a: "Wally", live: true },
] as const;

export const FREQS = [
  { n: "Freestyle Friday", dj: "DJ Kounta", g: "Hip-Hop · Rap", bg: "fbg1", e: "🎤", live: true },
  { n: "Mbalax Midnight", dj: "DJ Awa", g: "Mbalax · Traditional", bg: "fbg2", e: "🥁", live: true },
  { n: "Afro Sunrise", dj: "DJ Ibou", g: "Afrobeats · Soul", bg: "fbg3", e: "🌅", live: false },
  { n: "Diaspora Wave", dj: "DJ Rama", g: "Global · Fusion", bg: "fbg4", e: "🌍", live: false },
] as const;

export const SCHED = [
  { t: "21:00", n: "Afro Sunrise", dj: "DJ Ibou", day: "Sam" },
  { t: "23:30", n: "Mbalax Late", dj: "DJ Khadim", day: "Sam" },
  { t: "18:00", n: "Weekend Warm", dj: "DJ Rokhaya", day: "Dim" },
] as const;

export const DRAWER_MENU = [
  { ico: "💚", name: "RECT Wallet", desc: "Points, K21, fan support" },
  { ico: "📻", name: "RECT Radio", desc: "Live DJs · Premieres" },
  { ico: "📋", name: "Listening Journal", desc: "Your private listening life" },
  { ico: "🎓", name: "RECT Digital", desc: "Upload & distribute music" },
  { ico: "🏆", name: "RECT Score", desc: "Your fan credibility" },
  { ico: "⚙️", name: "Settings", desc: "Account · Language · Notifications" },
] as const;

export const CHART_TABS = [
  "Dakar",
  "Sénégal",
  "Afrique",
  "Diaspora",
  "RECT Rising",
  "Velocity",
] as const;

export const BROWSE = [
  { e: "🎵", l: "Music", bg: "bcbg1" },
  { e: "🎙️", l: "Podcasts", bg: "bcbg2" },
  { e: "🌍", l: "Worlds", bg: "bcbg3" },
  { e: "🚀", l: "Portals", bg: "bcbg4" },
  { e: "📻", l: "Radio", bg: "bcbg5" },
  { e: "🏆", l: "Charts", bg: "bcbg6" },
] as const;

export function moveClass(m: string) {
  if (m === "NEW") return "mv-nw";
  if (m.startsWith("+")) return "mv-up";
  return "mv-dn";
}

export type PageId = "home" | "search" | "radio" | "charts" | "you";
