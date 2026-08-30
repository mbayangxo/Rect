"use client";

import { FormEvent, useState } from "react";

export function ApplyForm({ jobSlug }: { jobSlug: string }) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/apply", {
        method: "POST",
        body: new FormData(form),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setError(result.error || "Could not send application.");
        setStatus("error");
        return;
      }
      form.reset();
      setStatus("success");
    } catch {
      setError("Could not reach the server.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p role="status" className="font-display text-3xl tracking-[0.08em] text-lime uppercase">
        Application in. We will read it in the portal.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 grid max-w-xl gap-4">
      <input type="hidden" name="jobSlug" value={jobSlug} />
      <label className="grid gap-2 text-sm uppercase tracking-[0.16em]" htmlFor="firstName">
        First name
        <input id="firstName" name="firstName" required className="normal-case border border-white/30 bg-transparent px-3 py-3" />
      </label>
      <label className="grid gap-2 text-sm uppercase tracking-[0.16em]" htmlFor="lastName">
        Last name
        <input id="lastName" name="lastName" required className="normal-case border border-white/30 bg-transparent px-3 py-3" />
      </label>
      <label className="grid gap-2 text-sm uppercase tracking-[0.16em]" htmlFor="email">
        Email
        <input id="email" name="email" type="email" required className="normal-case border border-white/30 bg-transparent px-3 py-3" />
      </label>
      <label className="grid gap-2 text-sm uppercase tracking-[0.16em]" htmlFor="note">
        Note
        <textarea id="note" name="note" rows={4} className="normal-case border border-white/30 bg-transparent px-3 py-3" />
      </label>
      <label className="grid gap-2 text-sm uppercase tracking-[0.16em]" htmlFor="resume">
        Resume
        <input id="resume" name="resume" type="file" required accept=".pdf,.doc,.docx,image/*" className="normal-case" />
      </label>
      {status === "error" ? (
        <p role="alert" className="text-pink">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="justify-self-start bg-lime px-8 py-3 font-display text-2xl text-ink uppercase disabled:opacity-60"
      >
        {status === "submitting" ? "Sending" : "Apply"}
      </button>
    </form>
  );
}
