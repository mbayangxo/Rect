"use client";

import { useState } from "react";

type Props = {
  linkedArtistName?: string | null;
};

export function ConnectArtistAccount({ linkedArtistName = null }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedName, setConnectedName] = useState(linkedArtistName);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/connect-artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json()) as {
        error?: string;
        artist_name?: string;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not connect Artist OS");
        return;
      }
      setConnectedName(data.artist_name || "Artist OS");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function disconnect() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/disconnect-artist", {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not disconnect");
        return;
      }
      setConnectedName(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 px-4 py-4">
      <p className="text-sm font-medium text-white/85">Artist OS</p>
      <p className="mt-1 text-xs text-white/40">
        Separate website and login — like RECT SOUND / artist. Optional: connect
        it to this listener account.
      </p>
      {connectedName ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-[#1DB954]">Connected to {connectedName}</p>
          <a
            href="/artist/login"
            className="block rounded-full bg-[#1DB954] px-4 py-2 text-center text-sm font-semibold text-black hover:bg-[#17a349]"
          >
            Log in to Artist OS
          </a>
          <button
            type="button"
            disabled={pending}
            onClick={() => void disconnect()}
            className="w-full text-xs text-white/40 hover:text-white disabled:opacity-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void connect(e)} className="mt-3 space-y-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Artist OS email"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-[#1DB954]"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Artist OS password"
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-[#1DB954]"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-full border border-white/20 py-2 text-sm text-white/80 hover:border-[#1DB954] disabled:opacity-50"
          >
            {pending ? "Connecting…" : "Connect Artist OS"}
          </button>
          <a
            href="/artist/signup"
            className="block text-center text-xs text-[#1DB954] hover:underline"
          >
            Create an artist account instead
          </a>
        </form>
      )}
      {error ? (
        <p className="mt-2 text-xs text-[#F5A623]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
