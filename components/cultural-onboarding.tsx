"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import "./cultural-onboarding.css";

const COUNTRIES = [
  "Sénégal",
  "Nigeria",
  "Côte d'Ivoire",
  "Mali",
  "Ghana",
  "Guinée",
  "Cameroun",
  "Congo",
  "Kenya",
  "Maroc",
  "Algérie",
  "Égypte",
  "Éthiopie",
  "Diaspora",
  "Other",
] as const;

const GENRES = [
  "Mbalax",
  "Afrobeats",
  "Hip-Hop",
  "Rap",
  "Afro-Soul",
  "R&B",
  "Amapiano",
  "Gospel",
  "Griotic",
  "Reggae",
  "Jazz",
  "Electronic",
  "Highlife",
  "Dancehall",
  "Kuduro",
  "Pop",
  "Wassoulou",
  "Coupé-Décalé",
  "Ndombolo",
] as const;

const LANGUAGES = [
  "Wolof",
  "Français",
  "English",
  "Yoruba",
  "Twi",
  "Bambara",
  "Fulani",
  "Swahili",
  "Lingala",
  "Arabic",
  "Amharic",
  "Dioula",
  "Serer",
  "Portuguese",
  "Spanish",
] as const;

const TIMES = [
  {
    id: "morning",
    emoji: "🌅",
    title: "Morning",
    sub: "Starting the day right",
  },
  {
    id: "afternoon",
    emoji: "☀️",
    title: "Afternoon",
    sub: "Background to everything",
  },
  {
    id: "evening",
    emoji: "🌆",
    title: "Evening",
    sub: "When the city comes alive",
  },
  {
    id: "late_night",
    emoji: "🌙",
    title: "Late Night",
    sub: "Just you and the sound",
  },
] as const;

type Role = "fan" | "artist";

function toggleItem(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function CulturalOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [countries, setCountries] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [listeningTimes, setListeningTimes] = useState<string[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = useMemo(() => {
    if (step === 1) return countries.length > 0;
    if (step === 2) return genres.length > 0;
    if (step === 3) return languages.length > 0;
    if (step === 4) return listeningTimes.length > 0;
    if (step === 5) return role !== null;
    if (step === 6) {
      return (
        displayName.trim().length >= 2 &&
        email.trim().includes("@") &&
        password.length >= 6
      );
    }
    return false;
  }, [
    step,
    countries,
    genres,
    languages,
    listeningTimes,
    role,
    displayName,
    email,
    password,
  ]);

  function go(next: number, direction: "forward" | "back") {
    setError(null);
    setDir(direction);
    setStep(next);
  }

  async function createAccount() {
    if (!role) {
      setError("Choose Fan or Artist.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          display_name: displayName.trim(),
          role,
          phone: phone.trim() || null,
          countries,
          genres,
          languages,
          listening_times: listeningTimes,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        has_session?: boolean;
        profile_save?: { ok: boolean; error?: string };
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not create account.");
        return;
      }
      if (!data.has_session) {
        setError("Account created — confirm email if required, then log in.");
        return;
      }
      if (data.profile_save && data.profile_save.ok === false) {
        setError(
          data.profile_save.error ||
            "Account created but profile save failed. You can still enter.",
        );
        // still enter — auth exists
        router.push("/dashboard");
        router.refresh();
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  function onContinue() {
    if (!canContinue || pending) return;
    if (step < 6) {
      go(step + 1, "forward");
      return;
    }
    void createAccount();
  }

  function panelClass(n: number) {
    if (n === step) return "cult-panel active";
    if (dir === "forward" && n < step) return "cult-panel exit-left";
    if (dir === "back" && n > step) return "cult-panel exit-left";
    return "cult-panel";
  }

  return (
    <div className="cult">
      <div className="cult-progress" aria-hidden>
        <span style={{ width: `${(step / 6) * 100}%` }} />
      </div>

      <div className="cult-top">
        <button
          type="button"
          className="cult-back"
          disabled={step === 1}
          onClick={() => go(step - 1, "back")}
        >
          ← Back
        </button>
        <span className="cult-stepnum">
          {step} / 6
        </span>
      </div>

      <div className="cult-stage">
        <section className={panelClass(1)} aria-hidden={step !== 1}>
          <div className="cult-body">
            <p className="cult-label">Step 1 of 6</p>
            <h1 className="cult-title">Where are you from?</h1>
            <p className="cult-sub">
              So we know whose music to put in front of you first.
            </p>
          </div>
          <div className="cult-chips" role="list">
            {COUNTRIES.map((c) => (
              <button
                key={c}
                type="button"
                role="listitem"
                className={`cult-chip ${countries.includes(c) ? "selected" : ""}`}
                onClick={() => setCountries((prev) => toggleItem(prev, c))}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        <section className={panelClass(2)} aria-hidden={step !== 2}>
          <div className="cult-body">
            <p className="cult-label">Step 2 of 6</p>
            <h1 className="cult-title">What moves you?</h1>
            <p className="cult-sub">Pick everything that hits different.</p>
          </div>
          <div className="cult-chips" role="list">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                className={`cult-chip ${genres.includes(g) ? "selected" : ""}`}
                onClick={() => setGenres((prev) => toggleItem(prev, g))}
              >
                {g}
              </button>
            ))}
          </div>
        </section>

        <section className={panelClass(3)} aria-hidden={step !== 3}>
          <div className="cult-body">
            <p className="cult-label">Step 3 of 6</p>
            <h1 className="cult-title">What languages do you feel music in?</h1>
            <p className="cult-sub">
              We&apos;ll make sure you always understand what you&apos;re
              feeling.
            </p>
          </div>
          <div className="cult-chips" role="list">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                className={`cult-chip ${languages.includes(l) ? "selected" : ""}`}
                onClick={() => setLanguages((prev) => toggleItem(prev, l))}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className={panelClass(4)} aria-hidden={step !== 4}>
          <div className="cult-body">
            <p className="cult-label">Step 4 of 6</p>
            <h1 className="cult-title">What time of day do you listen most?</h1>
            <p className="cult-sub">
              We&apos;ll have the right energy waiting for you.
            </p>
            <div className="cult-times">
              {TIMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`cult-time ${listeningTimes.includes(t.id) ? "selected" : ""}`}
                  onClick={() =>
                    setListeningTimes((prev) => toggleItem(prev, t.id))
                  }
                >
                  <div className="cult-time-emoji">{t.emoji}</div>
                  <div className="cult-time-title">{t.title}</div>
                  <div className="cult-time-sub">{t.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={panelClass(5)} aria-hidden={step !== 5}>
          <div className="cult-body">
            <p className="cult-label">Step 5 of 6</p>
            <h1 className="cult-title">Who are you on RECT?</h1>
            <p className="cult-sub">This shapes everything.</p>
            <div className="cult-roles">
              <button
                type="button"
                className={`cult-role ${role === "fan" ? "selected" : ""}`}
                onClick={() => setRole("fan")}
              >
                <div className="cult-role-emoji">🎧</div>
                <div className="cult-role-title">FAN</div>
                <div className="cult-role-sub">
                  {"I discover. I support.\nI make artists famous."}
                </div>
              </button>
              <button
                type="button"
                className={`cult-role ${role === "artist" ? "selected" : ""}`}
                onClick={() => setRole("artist")}
              >
                <div className="cult-role-emoji">🎤</div>
                <div className="cult-role-title">ARTIST</div>
                <div className="cult-role-sub">
                  {"I create. I upload.\nI get paid fairly."}
                </div>
              </button>
            </div>
          </div>
        </section>

        <section className={panelClass(6)} aria-hidden={step !== 6}>
          <div className="cult-body">
            <p className="cult-label">Step 6 of 6</p>
            <h1 className="cult-title">Almost inside.</h1>
            <p className="cult-sub">
              Your data stays yours. We never sell it.
            </p>

            <label className="cult-field">
              <span>Display name</span>
              <input
                className="cult-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={24}
                placeholder="Your name in the culture"
              />
              <small>Your name in the culture. Not your government name.</small>
            </label>

            <label className="cult-field">
              <span>Email</span>
              <input
                className="cult-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
              />
            </label>

            <label className="cult-field">
              <span>Password</span>
              <input
                className="cult-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </label>

            <label className="cult-field">
              <span>Phone number — optional</span>
              <input
                className="cult-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+221 70 000 0000"
              />
              <small>For JOKO payments and login</small>
            </label>

            {error ? <p className="cult-error">{error}</p> : null}
          </div>
        </section>
      </div>

      <div className="cult-footer">
        <button
          type="button"
          className="cult-continue"
          disabled={!canContinue || pending}
          onClick={onContinue}
        >
          {step < 6
            ? "Continue →"
            : pending
              ? "Creating…"
              : "Create My RECT →"}
        </button>
        {step === 6 ? (
          <p className="cult-login">
            Already have an account?{" "}
            <Link href="/auth/login">Log in</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
