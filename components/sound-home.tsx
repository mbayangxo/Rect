"use client";

import { useEffect, useState } from "react";
import LivingCanvas from "@/components/living-canvas";
import {
  BROWSE,
  CHALLENGES,
  CHART_DATA,
  CHART_TABS,
  DRAWER_MENU,
  FREQS,
  FRIENDS,
  HUB_EXITS,
  LIVE,
  MOVE_ICONS,
  MOVES,
  PORTALS,
  SCHED,
  TRACKS,
  TRENDING,
  TREND_REGIONS,
  WORLDS,
  moveClass,
  type PageId,
  type TrendRegion,
} from "@/lib/home-fixture";

function RectMark({ fill = "#040d06" }: { fill?: string }) {
  return (
    <svg className="logo-r" viewBox="0 0 14 17" fill="none" aria-hidden>
      <rect x="0" y="0" width="3" height="17" fill={fill} />
      <rect x="3" y="0" width="8" height="3" fill={fill} />
      <rect x="11" y="0" width="3" height="3" fill={fill} />
      <rect x="11" y="3" width="3" height="5" fill={fill} />
      <rect x="3" y="6" width="8" height="3" fill={fill} />
      <rect x="6" y="9" width="3" height="3" fill={fill} />
      <rect x="9" y="12" width="3" height="5" fill={fill} />
    </svg>
  );
}

function formatElapsed(pct: number) {
  const total = 232;
  const secs = Math.floor((pct / 100) * total);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const NAV: { id: PageId; icon: string; label: string }[] = [
  { id: "home", icon: "🏠", label: "Home" },
  { id: "search", icon: "🔍", label: "Search" },
  { id: "radio", icon: "📻", label: "Radio" },
  { id: "charts", icon: "📊", label: "Charts" },
  { id: "you", icon: "👤", label: "You" },
];

export default function SoundHome() {
  const [page, setPage] = useState<PageId>("home");
  const [pageVisible, setPageVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(42);
  const [liked, setLiked] = useState(false);
  const [heroMove, setHeroMove] = useState(0);
  const [mpMove, setMpMove] = useState(0);
  const [chartTab, setChartTab] = useState<(typeof CHART_TABS)[number]>("Dakar");
  const [trendRegion, setTrendRegion] = useState<TrendRegion>("Dakar");
  const [listeners, setListeners] = useState(TRACKS[0].listeners);

  const track = TRACKS[trackIndex];

  useEffect(() => {
    const t = setTimeout(() => setPlaying(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!playing) return;
      setPct((p) => (p >= 100 ? 0 : p + 0.055));
    }, 100);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    const id = setInterval(() => {
      const base = parseInt(TRACKS[trackIndex].listeners.replace(",", ""), 10);
      const delta = Math.floor((Math.random() - 0.4) * 12);
      setListeners(Math.max(base - 50, base + delta).toLocaleString());
    }, 3000);
    return () => clearInterval(id);
  }, [trackIndex]);

  function goPage(id: PageId) {
    setPageVisible(false);
    setPage(id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPageVisible(true));
    });
  }

  function loadTrack(i: number) {
    setTrackIndex(i);
    setListeners(TRACKS[i].listeners);
    setPlaying(true);
    goPage("home");
  }

  function loadTrackByName(song: string, artist: string) {
    const i = TRACKS.findIndex((t) => t.song === song || t.artist === artist);
    if (i >= 0) loadTrack(i);
  }

  function seekTo(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const next = ((e.clientX - rect.left) / rect.width) * 100;
    setPct(Math.max(0, Math.min(100, next)));
  }

  const artStyle = { ["--art-color" as string]: track.color };

  return (
    <div className="app">
      <LivingCanvas color={track.color} />

      <div
        className={`ov${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />
      <aside className={`drawer${drawerOpen ? " open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="dr-head">
          <span className="dr-title">RECT Sound</span>
          <button type="button" className="dr-close" onClick={() => setDrawerOpen(false)}>
            ✕
          </button>
        </div>
        <div className="dr-sec">
          <div className="dr-sec-l">Friends Listening Now</div>
          <div className="friends-grid">
            {FRIENDS.map((f) => (
              <div key={f.n} className={`fc-fr${f.live ? " live" : ""}`}>
                <div className="fct">
                  <div className={`fav${f.live ? " on" : ""}`}>👤</div>
                  <div className="fn">{f.n}</div>
                </div>
                <div className="fs">{f.s}</div>
                <div className="fa">{f.a}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          {DRAWER_MENU.map((m) => (
            <button key={m.name} type="button" className="dmi">
              <div className="dmi-ico">{m.ico}</div>
              <div className="dmi-t">
                <div className="dmi-n">{m.name}</div>
                <div className="dmi-d">{m.desc}</div>
              </div>
              <span className="dmi-a">›</span>
            </button>
          ))}
        </div>
      </aside>

      <header className="topbar">
        <div className="logo-wrap">
          <div className="logo-box">
            <RectMark />
            <span className="logo-ect">ECT</span>
          </div>
          <div className="logo-divider" />
          <span className="logo-section">Sound</span>
        </div>
        <div className="tb-r">
          <button type="button" className="ib notif" aria-label="Notifications">
            🔔
          </button>
          <button
            type="button"
            className="ib"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </button>
        </div>
      </header>

      <div className="hub">
        <span className="hub-label">RECT Hub</span>
        <div className="hub-sep" />
        {HUB_EXITS.map((h) => (
          <button key={h} type="button" className="hub-exit">
            {h} <span className="hub-arr">↗</span>
          </button>
        ))}
      </div>

      {/* HOME */}
      <div
        className={`page${page === "home" ? " active" : ""}${
          page === "home" && pageVisible ? " visible" : ""
        }`}
      >
        <div className="entrance-group">
          <div className="now-immersive">
            <div className="ni-glass">
              <div className="ni-art-zone">
                <div className="ni-art-gradient" style={{ background: track.grad }} />
                <div className="ni-pulse" style={artStyle} />
                <div className="ni-rings">
                  <div className="ni-ring" style={artStyle} />
                  <div className="ni-ring" style={artStyle} />
                  <div className="ni-ring" style={artStyle} />
                </div>
                <div className="ni-art-overlay" />
                <div className={`ni-vinyl${playing ? " playing" : ""}`} style={artStyle}>
                  <div
                    className="ni-vinyl-center"
                    style={{ borderColor: track.color }}
                  />
                </div>
                <div className="ni-social">
                  <div className="ns-bars">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="ns-bar"
                        style={{ background: track.color }}
                      />
                    ))}
                  </div>
                  <span className="ns-count">{listeners} now</span>
                </div>
                <div className="ni-identity">
                  <div className="ni-artist">{track.artist}</div>
                  <div className="ni-track">
                    {track.song} · {track.genre}
                  </div>
                </div>
              </div>
              <div className="now-controls">
                <div className="ctrl-row">
                  <div className="ctrl-meta">
                    <div className="ctrl-song">{track.song}</div>
                    <div className="ctrl-info">{track.chart}</div>
                  </div>
                  <div className="ctrl-actions">
                    <button
                      type="button"
                      className={`act-btn${liked ? " liked" : ""}`}
                      onClick={() => setLiked((v) => !v)}
                      aria-label="Like"
                    >
                      {liked ? "♥" : "♡"}
                    </button>
                    <button type="button" className="act-btn" aria-label="More">
                      ···
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`play-big${playing ? " playing" : ""}`}
                    onClick={() => setPlaying((p) => !p)}
                    aria-label={playing ? "Pause" : "Play"}
                  >
                    {playing ? "⏸" : "▶"}
                  </button>
                </div>
                <div className="prog-zone">
                  <div className="prog-track" onClick={seekTo}>
                    <div className="prog-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="prog-times">
                    <span>{formatElapsed(pct)}</span>
                    <span>3:52</span>
                  </div>
                </div>
                <div className="moves-row">
                  {MOVES.map((m, i) => (
                    <button
                      key={m}
                      type="button"
                      className={`move${heroMove === i ? " on" : ""}`}
                      onClick={() => setHeroMove(i)}
                    >
                      <span className="move-icon">{MOVE_ICONS[i]}</span>
                      <span className="move-label">{m}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="sh">
            <span className="sh-t">Portals</span>
            <button type="button" className="sh-m">
              All →
            </button>
          </div>
          <div className="scroll-row">
            {PORTALS.map((p, i) => (
              <button
                key={p.n}
                type="button"
                className="portal-card"
                onClick={() => loadTrack(i)}
              >
                <div className="pc-art">
                  <div className={`pc-bg ${p.bg}`}>{p.e}</div>
                  <div className="pc-shade" />
                  {p.live ? (
                    <div className="pc-tag tag-live">
                      <div className="ldot" />
                      LIVE
                    </div>
                  ) : (
                    <div className="pc-tag tag-open">OPEN</div>
                  )}
                  <div className="pc-fans">{p.f} inside</div>
                </div>
                <div className="pc-name">{p.n}</div>
                <div className="pc-genre">{p.g}</div>
              </button>
            ))}
          </div>

          <div className="sh">
            <span className="sh-t">Worlds</span>
            <button type="button" className="sh-m">
              Explore →
            </button>
          </div>
          <div className="scroll-row">
            {WORLDS.map((w) => (
              <div key={w.n} className="world-card">
                <div className={`wc-top ${w.bg}`}>
                  {w.e}
                  <div className="wc-shade" />
                  <div className="wc-n">{w.f}</div>
                </div>
                <div className="wc-body">
                  <div className="wc-name">{w.n}</div>
                  <div className="wc-by">{w.by}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="sh">
            <span className="sh-t">Live Right Now</span>
            <button type="button" className="sh-m">
              All →
            </button>
          </div>
          <div className="scroll-row">
            {LIVE.map((l) => (
              <div key={l.t} className="live-card">
                <div className={`lc-bg ${l.bg}`}>{l.e}</div>
                <div className="lc-grad" />
                <div className={`lc-tag2 ${l.tc}`}>{l.tag}</div>
                <div className="lc-body2">
                  <div className="lc-text2">{l.t}</div>
                  <div className="lc-sub2">{l.s}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="sh">
            <span className="sh-t">Dakar Top 7</span>
            <button type="button" className="sh-m" onClick={() => goPage("charts")}>
              Full chart →
            </button>
          </div>
          <div className="chart-box">
            <div className="chart-hd">
              <span className="chd-l">RECT Charts · Dakar</span>
              <span className="chd-r">Week 10 · 2026</span>
            </div>
            {CHART_DATA.map((c) => (
              <button
                key={c.r}
                type="button"
                className="cr"
                onClick={() => loadTrackByName(c.s, c.a)}
              >
                <div className={`cr-rank ${c.pc}`}>{c.r}</div>
                <div className={`cr-swatch ${c.c}`}>{c.t}</div>
                <div className="cr-info">
                  <div className="cr-song">{c.s}</div>
                  <div className="cr-artist">{c.a}</div>
                </div>
                <div className="cr-right">
                  <span className={`mv-b ${moveClass(c.m)}`}>{c.m}</span>
                  <span className="cr-st">{c.st}</span>
                </div>
              </button>
            ))}
          </div>
          <div style={{ height: "0.4rem" }} />
        </div>
      </div>

      {/* SEARCH */}
      <div
        className={`page${page === "search" ? " active" : ""}${
          page === "search" && pageVisible ? " visible" : ""
        }`}
      >
        <div style={{ height: "0.3rem" }} />
        <div className="search-box">
          <span className="si">🔍</span>
          <input type="text" placeholder="Artists, songs, worlds, portals…" />
        </div>
        <div className="sh">
          <span className="sh-t">Browse</span>
        </div>
        <div className="browse-grid">
          {BROWSE.map((b) => (
            <div key={b.l} className={`bc ${b.bg}`}>
              <div className="bc-e">{b.e}</div>
              <div className="bc-l">{b.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RADIO */}
      <div
        className={`page${page === "radio" ? " active" : ""}${
          page === "radio" && pageVisible ? " visible" : ""
        }`}
      >
        <div style={{ height: "0.3rem" }} />
        <div className="radio-hero">
          <div className="rh-tag">
            <div className="ldot" style={{ background: "var(--red)" }} />
            LIVE NOW
          </div>
          <div className="rh-name">Freestyle Friday</div>
          <div className="rh-sub">DJ Kounta · Dakar · Rect SZN Arc 4</div>
          <button type="button" className="rh-btn">
            ▶ Enter frequency
          </button>
          <div className="rh-deco">📻</div>
        </div>
        <div className="sh">
          <span className="sh-t">Frequencies</span>
          <button type="button" className="sh-m">
            All →
          </button>
        </div>
        <div className="scroll-row">
          {FREQS.map((f) => (
            <div key={f.n} className="freq-card">
              <div className={`fc-art ${f.bg}`}>
                {f.e}
                <div className="fc-shade" />
                {f.live ? (
                  <div className="fc-live-tag">
                    <div className="ldot" style={{ background: "#fff" }} />
                    LIVE
                  </div>
                ) : (
                  <div className="fc-soon">SOON</div>
                )}
              </div>
              <div className="fc-body">
                <div className="fc-name">{f.n}</div>
                <div className="fc-dj">{f.dj}</div>
                <div className="fc-genre">{f.g}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="sh">
          <span className="sh-t">Schedule</span>
        </div>
        <div className="chart-box" style={{ margin: "0 1.1rem 1rem" }}>
          <div className="chart-hd">
            <span className="chd-l">This Week · Dakar</span>
            <span className="chd-r">Local time</span>
          </div>
          {SCHED.map((s) => (
            <div key={s.n} className="cr" style={{ cursor: "default" }}>
              <div
                className="cr-rank"
                style={{
                  width: "auto",
                  fontSize: "0.58rem",
                  color: "var(--g)",
                  whiteSpace: "nowrap",
                }}
              >
                {s.t}
              </div>
              <div className="cr-info">
                <div className="cr-song">{s.n}</div>
                <div className="cr-artist">
                  {s.dj} · {s.day}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: "0.4rem" }} />
      </div>

      {/* CHARTS */}
      <div
        className={`page${page === "charts" ? " active" : ""}${
          page === "charts" && pageVisible ? " visible" : ""
        }`}
      >
        <div style={{ height: "0.4rem" }} />
        <div className="chart-tabs-scroll">
          {CHART_TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`ct${chartTab === t ? " on" : ""}`}
              onClick={() => setChartTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="chart-box" style={{ margin: "0 1.1rem 1rem" }}>
          <div className="chart-hd">
            <span className="chd-l">RECT Charts · {chartTab}</span>
            <span className="chd-r">Week 10 · 2026</span>
          </div>
          {CHART_DATA.map((c) => (
            <button
              key={`full-${c.r}`}
              type="button"
              className="cr"
              onClick={() => loadTrackByName(c.s, c.a)}
            >
              <div className={`cr-rank ${c.pc}`}>{c.r}</div>
              <div className={`cr-swatch ${c.c}`}>{c.t}</div>
              <div className="cr-info">
                <div className="cr-song">{c.s}</div>
                <div className="cr-artist">{c.a}</div>
              </div>
              <div className="cr-right">
                <span className={`mv-b ${moveClass(c.m)}`}>{c.m}</span>
                <span className="cr-st">{c.st}</span>
              </div>
            </button>
          ))}
        </div>
        <div style={{ height: "0.4rem" }} />
      </div>

      {/* YOU */}
      <div
        className={`page${page === "you" ? " active" : ""}${
          page === "you" && pageVisible ? " visible" : ""
        }`}
      >
        <div style={{ height: "0.3rem" }} />
        <div className="profile-hero">
          <div className="ph-top">
            <div className="ph-av">👤</div>
            <div>
              <div className="ph-name">Moussa Diallo</div>
              <div className="ph-handle">@moussa.dkr · Dakar · Member since 2026</div>
            </div>
          </div>
          <div className="ph-stats">
            <div className="ps">
              <div className="ps-n">847</div>
              <div className="ps-l">Artists</div>
            </div>
            <div className="ps">
              <div className="ps-n">12K</div>
              <div className="ps-l">Streams</div>
            </div>
            <div className="ps">
              <div className="ps-n">34</div>
              <div className="ps-l">Worlds</div>
            </div>
          </div>
        </div>
        <div className="you-sec">
          <div className="you-sec-t">Library</div>
          <button type="button" className="yr">
            <div className="yr-ico">🌙</div>
            <div className="yr-t">
              <div className="yr-n">My Worlds</div>
              <div className="yr-d">Worlds you&apos;ve created or saved</div>
            </div>
            <span className="yr-a">›</span>
          </button>
          <button type="button" className="yr">
            <div className="yr-ico">📍</div>
            <div className="yr-t">
              <div className="yr-n">Your Marks</div>
              <div className="yr-d">Moments you&apos;ve timestamped</div>
            </div>
            <span className="yr-a">›</span>
          </button>
          <button type="button" className="yr">
            <div className="yr-ico">📖</div>
            <div className="yr-t">
              <div className="yr-n">Listening Journal</div>
              <div className="yr-d">Your private listening life</div>
            </div>
            <span className="yr-a">›</span>
          </button>
        </div>
        <div className="you-sec">
          <div className="you-sec-t">Account</div>
          <button type="button" className="yr">
            <div className="yr-ico">💚</div>
            <div className="yr-t">
              <div className="yr-n">RECT Wallet</div>
              <div className="yr-d">K21, fan support, points</div>
            </div>
            <span className="yr-a">›</span>
          </button>
          <button type="button" className="yr">
            <div className="yr-ico">🎤</div>
            <div className="yr-t">
              <div className="yr-n">Upload Music</div>
              <div className="yr-d">RECT Digital distribution</div>
            </div>
            <span className="yr-a">›</span>
          </button>
          <button type="button" className="yr">
            <div className="yr-ico">⚙️</div>
            <div className="yr-t">
              <div className="yr-n">Settings</div>
              <div className="yr-d">Account · Language · Privacy</div>
            </div>
            <span className="yr-a">›</span>
          </button>
        </div>
        <div style={{ height: "0.4rem" }} />
      </div>

      <div className="mini-player">
        <div className="mp-prog">
          <div className="mp-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="mp-row">
          <div className="mp-thumb">{track.emoji}</div>
          <div className="mp-info">
            <div className="mp-song">{track.song}</div>
            <div className="mp-artist">
              {track.artist} · Dakar
            </div>
          </div>
          <div className="mp-ctrl">
            <button type="button" className="mp-c" aria-label="Previous">
              ⏮
            </button>
            <button
              type="button"
              className="mp-play"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "⏸" : "▶"}
            </button>
            <button type="button" className="mp-c" aria-label="Next">
              ⏭
            </button>
          </div>
        </div>
        <div className="mp-moves">
          {MOVES.map((m, i) => (
            <button
              key={m}
              type="button"
              className={`mm${mpMove === i ? " on" : ""}`}
              onClick={() => setMpMove(i)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <nav className="nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            className={`ni${page === n.id ? " on" : ""}`}
            onClick={() => goPage(n.id)}
          >
            <span className="ni-ico">{n.icon}</span>
            <span className="ni-lbl">{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
