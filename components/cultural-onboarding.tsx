"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import "./cultural-onboarding.css";

const COUNTRIES = [
  "Senegal",
  "Nigeria",
  "Ghana",
  "Ivory Coast",
  "Mali",
  "Guinea",
  "Cameroon",
  "Congo",
  "South Africa",
  "Kenya",
  "Morocco",
  "Egypt",
  "USA",
  "France",
  "UK",
  "Canada",
] as const;

const GENRES = [
  "Afrobeats",
  "Amapiano",
  "Mbalax",
  "Highlife",
  "Afrohouse",
  "Coupé-Décalé",
  "Soukous",
  "Afro-R&B",
  "Drill",
  "Gospel",
  "Traditional",
  "Hip-Hop",
] as const;

const LANGUAGES = [
  "Wolof",
  "Yoruba",
  "Igbo",
  "Hausa",
  "French",
  "English",
  "Swahili",
  "Arabic",
  "Portuguese",
  "Zulu",
  "Akan",
  "Lingala",
] as const;

const TIMES = [
  {
    id: "morning",
    emoji: "🌅",
    title: "Morning",
    sub: "Soft energy. Start the day right.",
  },
  {
    id: "afternoon",
    emoji: "☀️",
    title: "Afternoon",
    sub: "Focus mode. Work and create.",
  },
  {
    id: "evening",
    emoji: "🌆",
    title: "Evening",
    sub: "Unwind. The culture softens.",
  },
  {
    id: "night",
    emoji: "🌙",
    title: "Late Night",
    sub: "Deep cuts. Alone with the sound.",
  },
] as const;

const TOTAL = 5;

function toggleItem(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((x) => x !== value)
    : [...list, value];
}

/** Fan-only cultural onboarding — artists use /for-artists */
export function CulturalOnboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [countries, setCountries] = useState<string[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [listeningTimes, setListeningTimes] = useState<string[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showPasswordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  const canContinue = useMemo(() => {
    if (step === 1) return countries.length > 0;
    if (step === 2) return genres.length > 0;
    if (step === 3) return languages.length > 0;
    if (step === 4) return listeningTimes.length > 0;
    if (step === 5) {
      return (
        displayName.trim().length >= 2 &&
        email.trim().includes("@") &&
        password.length >= 6 &&
        confirmPassword.length >= 6 &&
        password === confirmPassword
      );
    }
    return false;
  }, [
    step,
    countries,
    genres,
    languages,
    listeningTimes,
    displayName,
    email,
    password,
    confirmPassword,
  ]);

  function go(next: number, direction: "forward" | "back") {
    setError(null);
    setDir(direction);
    setStep(next);
  }

  async function createAccount() {
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
          role: "fan",
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
    if (step < TOTAL) {
      go(step + 1, "forward");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
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
        <span style={{ width: `${(step / TOTAL) * 100}%` }} />
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
          {step} / {TOTAL}
        </span>
      </div>

      <div className="cult-stage">
        <section className={panelClass(1)} aria-hidden={step !== 1}>
          <div className="cult-body">
            <p className="cult-label">Step 1 of {TOTAL}</p>
            <h1 className="cult-title">Where are you from?</h1>
            <p className="cult-sub">
              So we know whose music to put in front of you first.
            </p>
            <div className="cult-chips">
              {COUNTRIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`cult-chip ${countries.includes(c) ? "selected" : ""}`}
                  onClick={() => setCountries((prev) => toggleItem(prev, c))}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={panelClass(2)} aria-hidden={step !== 2}>
          <div className="cult-body">
            <p className="cult-label">Step 2 of {TOTAL}</p>
            <h1 className="cult-title">What moves you?</h1>
            <p className="cult-sub">Pick everything that hits different.</p>
            <div className="cult-chips">
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
          </div>
        </section>

        <section className={panelClass(3)} aria-hidden={step !== 3}>
          <div className="cult-body">
            <p className="cult-label">Step 3 of {TOTAL}</p>
            <h1 className="cult-title">What languages do you feel music in?</h1>
            <p className="cult-sub">
              We&apos;ll make sure you always understand what you&apos;re
              feeling.
            </p>
            <div className="cult-chips">
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
          </div>
        </section>

        <section className={panelClass(4)} aria-hidden={step !== 4}>
          <div className="cult-body">
            <p className="cult-label">Step 4 of {TOTAL}</p>
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
            <p className="cult-label">Step 5 of {TOTAL}</p>
            <h1 className="cult-title">Create your account</h1>
            <p className="cult-sub">
              Start listening. Artists join separately at For artists.
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
              <span>Confirm Password</span>
              <input
                className="cult-input"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
              />
            </label>
            {showPasswordMismatch ? (
              <p className="cult-mismatch">Passwords don&apos;t match</p>
            ) : null}

            <label className="cult-field">
              <span>Phone number — optional</span>
              <input
                className="cult-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+221 70 000 0000"
              />
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
          {step < TOTAL
            ? "Continue →"
            : pending
              ? "Creating…"
              : "Start listening →"}
        </button>
        {step === TOTAL ? (
          <p className="cult-login">
            Already have an account?{" "}
            <Link href="/auth/login">Log in</Link>
            <br />
            <Link href="/for-artists" style={{ opacity: 0.7 }}>
              Are you an artist?
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
