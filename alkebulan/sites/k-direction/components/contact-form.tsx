"use client";

import { FormEvent, useState } from "react";

type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      firstName: String(data.get("first") ?? ""),
      lastName: String(data.get("last") ?? ""),
      email: String(data.get("email") ?? ""),
      message: String(data.get("message") ?? ""),
      company: String(data.get("company") ?? ""),
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setError(result.error || "Could not send. Try again.");
        setStatus("error");
        return;
      }
      form.reset();
      setStatus("success");
    } catch {
      setError("Could not reach the server. Try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <p role="status" className="max-w-xl font-display text-3xl tracking-[0.08em] text-lime uppercase">
        Thanks. Your message is in. We will reply from K-Direction.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm uppercase tracking-[0.16em]" htmlFor="first">
          First Name
          <input
            id="first"
            name="first"
            autoComplete="given-name"
            maxLength={80}
            className="normal-case border border-white/30 bg-transparent px-3 py-3 text-base tracking-normal text-white outline-none focus-visible:border-lime"
          />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.16em]" htmlFor="last">
          Last Name
          <input
            id="last"
            name="last"
            autoComplete="family-name"
            maxLength={80}
            className="normal-case border border-white/30 bg-transparent px-3 py-3 text-base tracking-normal text-white outline-none focus-visible:border-lime"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm uppercase tracking-[0.16em]" htmlFor="email">
        Email
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          className="normal-case border border-white/30 bg-transparent px-3 py-3 text-base tracking-normal text-white outline-none focus-visible:border-lime"
        />
      </label>
      <label className="grid gap-2 text-sm uppercase tracking-[0.16em]" htmlFor="message">
        Message
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={4000}
          className="normal-case border border-white/30 bg-transparent px-3 py-3 text-base tracking-normal text-white outline-none focus-visible:border-lime"
        />
      </label>
      {status === "error" ? (
        <p role="alert" className="text-pink">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="justify-self-start bg-lime px-8 py-3 font-display text-2xl tracking-[0.14em] text-ink uppercase hover:bg-pink disabled:cursor-wait disabled:opacity-60"
      >
        {status === "submitting" ? "Sending" : "Send"}
      </button>
    </form>
  );
}
