"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Role = "fan" | "artist";

type TrackPick = {
  title: string;
  artist: string;
  emoji: string;
};

type SignupResponse = {
  ok?: boolean;
  error?: string;
  user_id?: string;
  has_session?: boolean;
  email_confirmation_required?: boolean;
  profile_save?: {
    ok: boolean;
    mode?: string;
    error?: string;
  } | null;
  display_name?: string;
  city?: string | null;
};

const CITIES = [
  { name: "Dakar", country: "SÉNÉGAL", flag: "🇸🇳" },
  { name: "Lagos", country: "NIGERIA", flag: "🇳🇬" },
  { name: "Abidjan", country: "CÔTE D'IVOIRE", flag: "🇨🇮" },
  { name: "Accra", country: "GHANA", flag: "🇬🇭" },
  { name: "Nairobi", country: "KENYA", flag: "🇰🇪" },
  {
    name: "Johannesburg",
    country: "SOUTH AFRICA",
    flag: "🇿🇦",
    label: "Jo'burg",
  },
  { name: "Bamako", country: "MALI", flag: "🇲🇱" },
  { name: "Conakry", country: "GUINÉE", flag: "🇬🇳" },
  { name: "Kinshasa", country: "DRC", flag: "🇨🇩" },
  { name: "Addis Ababa", country: "ETHIOPIA", flag: "🇪🇹", label: "Addis" },
] as const;

const CITY_TRACKS: Record<string, TrackPick[]> = {
  Dakar: [
    { title: "Wii Ma Yëgël", artist: "Wally Ballago Seck · Dakar", emoji: "🎺" },
    { title: "Kay Way", artist: "VJ · Dakar", emoji: "🎵" },
    { title: "Yaye", artist: "Viviane Chidid · Dakar", emoji: "🌟" },
  ],
  Lagos: [
    { title: "Essence", artist: "Wizkid · Lagos", emoji: "🔥" },
    { title: "Calm Down", artist: "Rema · Benin City", emoji: "🎶" },
  ],
  Abidjan: [{ title: "Tchop Tchop", artist: "Josey · Abidjan", emoji: "💫" }],
  default: [{ title: "Essence", artist: "Wizkid · Lagos", emoji: "🔥" }],
};

const CITY_CODES: Record<string, string> = {
  Dakar: "DKR",
  Lagos: "LOS",
  Abidjan: "ABJ",
  Accra: "ACC",
  Nairobi: "NBO",
  Johannesburg: "JNB",
  Bamako: "BKO",
  Conakry: "CKY",
  Kinshasa: "FIH",
  "Addis Ababa": "ADD",
  Diaspora: "🌍",
};

const PROGRESS = [0, 0, 20, 40, 60, 80, 100];

export function OnboardingFlow() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [screen, setScreen] = useState(1);
  const [role, setRole] = useState<Role>("fan");
  const [city, setCity] = useState("");
  const [listenRound, setListenRound] = useState(0);
  const [listenLiked, setListenLiked] = useState<boolean | null>(null);
  const [track, setTrack] = useState<TrackPick | null>(null);
  const [artFlash, setArtFlash] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [artistBio, setArtistBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signupResult, setSignupResult] = useState<SignupResponse | null>(null);

  const bars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        height: 25 + ((i * 17) % 70),
        delay: (i % 10) * 0.04,
      })),
    [],
  );

  function goTo(next: number) {
    setError(null);
    setScreen(next);
  }

  function selectRole(next: Role) {
    setRole(next);
    goTo(2);
  }

  function pickCity(name: string) {
    setCity(name);
    const tracks = CITY_TRACKS[name] ?? CITY_TRACKS.default;
    setTrack(tracks[0]);
    setListenRound(0);
    setListenLiked(null);
    window.setTimeout(() => goTo(3), 180);
  }

  function listenReact(liked: boolean) {
    const tracks = CITY_TRACKS[city] ?? CITY_TRACKS.default;
    const nextRound = listenRound + 1;
    setListenRound(nextRound);

    if (liked) {
      setListenLiked(true);
      goTo(4);
      return;
    }

    if (nextRound >= 3) {
      setListenLiked(false);
      goTo(4);
      return;
    }

    setListenLiked(false);
    const next = tracks[Math.min(nextRound, tracks.length - 1)];
    setArtFlash(true);
    window.setTimeout(() => {
      setTrack(next);
      setArtFlash(false);
    }, 280);
  }

  async function createAccount() {
    setError(null);
    const name = displayName.trim();
    if (name.length < 2) {
      setError("Enter a display name first.");
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError("Email and a password (6+ characters) are required.");
      return;
    }
    if (!city) {
      setError("Pick your city before creating an account.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          display_name: name,
          role,
          city,
          phone: phone.trim() || null,
          artist_bio: role === "artist" ? artistBio.trim() || null : null,
          listen_liked: listenLiked,
        }),
      });
      const data = (await res.json()) as SignupResponse;
      if (!res.ok || data.error) {
        const msg = data.error || "Could not create account.";
        if (/rate limit/i.test(msg)) {
          setError(
            "Email rate limit hit — wait a few minutes, then try again.",
          );
        } else {
          setError(msg);
        }
        return;
      }
      setSignupResult(data);
      goTo(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error creating account.");
    } finally {
      setPending(false);
    }
  }

  function enterRect() {
    router.push("/");
    router.refresh();
  }

  const showChrome = screen > 1 && screen < 6;
  const cityCode =
    CITY_CODES[city] || (city ? city.slice(0, 3).toUpperCase() : "—");
  const needsEmailConfirm = !!signupResult?.email_confirmation_required;
  const profileMode = signupResult?.profile_save?.mode;
  const profileFailed =
    signupResult?.profile_save && signupResult.profile_save.ok === false;

  return (
    <div className="onboard">
      <div className="onboard-progress">
        <div
          className="onboard-progress-fill"
          style={{ width: `${PROGRESS[screen] ?? 0}%` }}
        />
      </div>

      {showChrome ? (
        <button
          type="button"
          className="onboard-back"
          onClick={() => goTo(screen === 2 ? 1 : screen - 1)}
        >
          ← Back
        </button>
      ) : null}
      {showChrome ? <div className="onboard-step">{screen - 1} / 5</div> : null}

      <div className={`ob-screen ${screen === 1 ? "active" : ""}`}>
        <div className="s1-bg">
          <div className="s1-pattern" />
          <div className="s1-orb a" />
          <div className="s1-orb b" />
          <div className="s1-bars">
            {bars.map((b) => (
              <div
                key={b.id}
                className="s1-bar"
                style={{
                  height: `${b.height}%`,
                  animationDelay: `${b.delay}s`,
                }}
              />
            ))}
          </div>
        </div>
        <div className="s1-content">
          <div className="s1-wordmark">
            <span className="r">R</span>ECT
          </div>
          <p className="s1-line">Africa&apos;s music. Your world.</p>
          <div className="s1-choices">
            <button
              type="button"
              className="choice-btn choice-fan"
              onClick={() => selectRole("fan")}
            >
              I&apos;m a Fan
              <span className="choice-sub">Listen, discover, support</span>
            </button>
            <button
              type="button"
              className="choice-btn choice-artist"
              onClick={() => selectRole("artist")}
            >
              I&apos;m an Artist
              <span className="choice-sub">Upload, earn, grow</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`ob-screen ${screen === 2 ? "active" : ""}`}>
        <div className="s2-top">
          <div className="ob-label">Step 1 of 4</div>
          <h2 className="ob-title">
            Where are
            <br />
            you from?
          </h2>
          <p className="ob-sub">Your city shapes everything you hear on RECT.</p>
        </div>
        <div className="city-grid">
          {CITIES.map((c) => (
            <button
              key={c.name}
              type="button"
              className={`city-card ${city === c.name ? "selected" : ""}`}
              onClick={() => pickCity(c.name)}
            >
              <span className="city-flag">{c.flag}</span>
              <div className="city-name">{"label" in c ? c.label : c.name}</div>
              <div className="city-country">{c.country}</div>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="diaspora-btn"
          onClick={() => pickCity("Diaspora")}
        >
          🌍 I&apos;m outside Africa — diaspora
        </button>
      </div>

      <div className={`ob-screen ${screen === 3 ? "active" : ""}`}>
        <div className="s3-body">
          <div className="ob-label">Step 2 of 4</div>
          <h2 className="ob-title">Feel this.</h2>
          <p className="ob-sub">
            City picks for now — full catalog audio connects when tracks are
            uploaded.
          </p>

          <div className="listen-player">
            <div
              className="listen-art playing"
              style={
                artFlash
                  ? { opacity: 0, transform: "scale(0.9)" }
                  : undefined
              }
            >
              <div className="np-label">
                <span className="np-dot" />
                NOW PLAYING
              </div>
              {track?.emoji ?? "🎵"}
            </div>

            <div>
              <div className="lt-title">{track?.title ?? "Loading..."}</div>
              <div className="lt-artist">{track?.artist ?? "—"}</div>
            </div>

            <div className="listen-wave">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="lw" />
              ))}
            </div>

            <div>
              <div className="lq-text">Did this move you?</div>
              <div className="lq-buttons">
                <button
                  type="button"
                  className="lq-yes"
                  onClick={() => listenReact(true)}
                >
                  Yes 🔥
                </button>
                <button
                  type="button"
                  className="lq-no"
                  onClick={() => listenReact(false)}
                >
                  Not really
                </button>
              </div>
              <button
                type="button"
                className="listen-skip"
                onClick={() => {
                  setListenLiked(null);
                  goTo(4);
                }}
              >
                Skip this step →
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`ob-screen ${screen === 4 ? "active" : ""}`}>
        <div className="s4-body">
          <div className="ob-label">Step 3 of 4</div>
          <h2 className="ob-title">
            Your name
            <br />
            in the culture.
          </h2>
          <p className="ob-sub">
            Not your government name. What do people call you?
          </p>

          <div className="name-visual">
            <div className="name-bg-text">
              {displayName.trim() ? displayName.toUpperCase() : "YOU"}
            </div>
            <div
              className={`name-preview ${displayName.trim() ? "" : "placeholder"}`}
            >
              {displayName.trim() || "Your name"}
              <span className="name-cursor" />
            </div>
          </div>

          <div>
            <input
              className="name-field"
              type="text"
              placeholder="Enter your RECT name"
              maxLength={24}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <div className="name-hint">
              SHOWN PUBLICLY · SAVED TO YOUR PROFILE · MAX 24 CHARS
            </div>
            <button
              type="button"
              className="ob-continue"
              disabled={displayName.trim().length < 2}
              onClick={() => goTo(5)}
            >
              Continue →
            </button>
          </div>
        </div>
      </div>

      <div className={`ob-screen ${screen === 5 ? "active" : ""}`}>
        <div className="s5-body">
          <div className="ob-label">Step 4 of 4</div>
          <h2 className="ob-title">
            Almost
            <br />
            inside.
          </h2>
          <p className="ob-sub">
            Email + password create your account. Phone is optional contact.
          </p>

          <div className="account-form">
            <div className="input-group">
              <label className="input-label" htmlFor="email">
                Email (required)
              </label>
              <input
                id="email"
                className="rect-input"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="password">
                Password (required)
              </label>
              <input
                id="password"
                className="rect-input"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="or-divider">optional</div>

            <div className="input-group">
              <label className="input-label" htmlFor="phone">
                Phone number
              </label>
              <input
                id="phone"
                className="rect-input"
                type="tel"
                placeholder="+221 70 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {role === "artist" ? (
              <div className="artist-extra">
                <div className="artist-extra-label">◆ What do you make?</div>
                <textarea
                  placeholder="Tell us in one sentence. Rap, production, sabar beats, afrosoul — whatever it is."
                  value={artistBio}
                  onChange={(e) => setArtistBio(e.target.value)}
                />
              </div>
            ) : null}

            <p className="terms-note">
              By joining you agree to RECT&apos;s <span>Terms</span> and{" "}
              <span>Privacy Policy</span>.
              <br />
              Your data stays yours. We never sell it.
            </p>

            {error ? <p className="form-error">{error}</p> : null}

            <button
              type="button"
              className="ob-continue"
              disabled={pending}
              onClick={() => void createAccount()}
            >
              {pending ? "Creating…" : "Create My RECT →"}
            </button>
          </div>
        </div>
      </div>

      <div className={`ob-screen ${screen === 6 ? "active" : ""}`}>
        <div className="s6-body">
          <div className="ready-content">
            <div className="ready-icon">{needsEmailConfirm ? "✉️" : "🎵"}</div>
            <h2 className="ready-h">
              {needsEmailConfirm ? (
                <>
                  <span className="rx">Check</span>
                  <br />
                  your
                  <br />
                  email.
                </>
              ) : (
                <>
                  <span className="rx">Your</span>
                  <br />
                  RECT
                  <br />
                  is ready.
                </>
              )}
            </h2>
            <p className="ready-sub">
              {needsEmailConfirm ? (
                <>
                  We created your account for{" "}
                  <strong style={{ color: "#F4F0E8", fontStyle: "normal" }}>
                    {email.trim()}
                  </strong>
                  . Confirm the link, then log in — your name, role, and city
                  are stored on the account.
                </>
              ) : (
                <>
                  {displayName.trim() || "You're"} now part of the culture.
                  <br />
                  Everything in here was built for you.
                </>
              )}
            </p>
            <div className="ready-stats">
              <div className="rs">
                <div className="rs-num">{cityCode}</div>
                <div className="rs-label">Your City</div>
              </div>
              <div className="rs">
                <div className="rs-num">{role === "artist" ? "ART" : "FAN"}</div>
                <div className="rs-label">Your role</div>
              </div>
              <div className="rs">
                <div className="rs-num">
                  {profileMode === "full"
                    ? "DB"
                    : profileMode === "minimal"
                      ? "META"
                      : needsEmailConfirm
                        ? "AUTH"
                        : "—"}
                </div>
                <div className="rs-label">
                  {profileFailed
                    ? "Save issue"
                    : profileMode === "full"
                      ? "Profile saved"
                      : profileMode === "minimal"
                        ? "Partial save"
                        : "Account"}
                </div>
              </div>
            </div>
            {profileFailed ? (
              <p className="form-error" style={{ marginBottom: "1rem" }}>
                Profile row save failed: {signupResult?.profile_save?.error}.
                Auth account still exists — log in after confirming email.
              </p>
            ) : null}
            {profileMode === "minimal" ? (
              <p className="terms-note" style={{ marginBottom: "1rem" }}>
                City/phone columns are not on `users` yet. Run
                `supabase/migrations/20260806_onboarding_users.sql` in the
                Supabase SQL editor so the full profile persists.
              </p>
            ) : null}
            {needsEmailConfirm ? (
              <button
                type="button"
                className="ob-continue"
                onClick={() => router.push("/auth/login")}
              >
                Go to Log in →
              </button>
            ) : (
              <button type="button" className="ob-continue" onClick={enterRect}>
                Enter RECT →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
