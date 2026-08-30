"use client";

import { FormEvent, useState } from "react";
import { site } from "@/content/site";

export function ContactForm() {
  const [sent, setSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const first = String(data.get("first") ?? "").trim();
    const last = String(data.get("last") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();
    const body = [
      first || last ? `Name: ${[first, last].filter(Boolean).join(" ")}` : "",
      email ? `Email: ${email}` : "",
      "",
      message,
    ]
      .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
      .join("\n");
    const href = `mailto:${site.emails.inquiries}?subject=${encodeURIComponent(
      "K-Direction inquiry",
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setSent(true);
  }

  if (sent) {
    return (
      <p className="font-display text-3xl tracking-[0.08em] text-lime uppercase">
        Thanks for submitting!
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm uppercase tracking-[0.16em]">
          First Name
          <input
            name="first"
            autoComplete="given-name"
            className="border border-white/30 bg-transparent px-3 py-3 text-base tracking-normal text-white outline-none focus:border-lime"
          />
        </label>
        <label className="grid gap-2 text-sm uppercase tracking-[0.16em]">
          Last Name
          <input
            name="last"
            autoComplete="family-name"
            className="border border-white/30 bg-transparent px-3 py-3 text-base tracking-normal text-white outline-none focus:border-lime"
          />
        </label>
      </div>
      <label className="grid gap-2 text-sm uppercase tracking-[0.16em]">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="border border-white/30 bg-transparent px-3 py-3 text-base tracking-normal text-white outline-none focus:border-lime"
        />
      </label>
      <label className="grid gap-2 text-sm uppercase tracking-[0.16em]">
        Message
        <textarea
          name="message"
          required
          rows={6}
          className="border border-white/30 bg-transparent px-3 py-3 text-base tracking-normal text-white outline-none focus:border-lime"
        />
      </label>
      <button
        type="submit"
        className="justify-self-start bg-lime px-8 py-3 font-display text-2xl tracking-[0.14em] text-ink uppercase hover:bg-pink"
      >
        Send
      </button>
    </form>
  );
}
