"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CityDemandRow } from "@/lib/dashboard/tour-demand";
import type { TourEvent } from "@/lib/dashboard/tour-events";

type Props = {
  initialEvents: TourEvent[];
  demand: CityDemandRow[];
  ready: boolean;
  demandReady: boolean;
  storeError: string | null;
};

export function StudioTourManager({
  initialEvents,
  demand,
  ready,
  demandReady,
  storeError,
}: Props) {
  const router = useRouter();
  const [events, setEvents] = useState(initialEvents);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [fekkId, setFekkId] = useState("");
  const [fekkUrl, setFekkUrl] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setCity("");
    setVenue("");
    setStartsAt("");
    setPrice("");
    setCapacity("");
    setFekkId("");
    setFekkUrl("");
    setDescription("");
    setShowForm(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/artist/tour-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          city,
          venue: venue || null,
          starts_at: startsAt ? new Date(startsAt).toISOString() : "",
          ticket_price_xof: price.trim() === "" ? null : Number(price),
          capacity: capacity.trim() === "" ? null : Number(capacity),
          fekk_event_id: fekkId || null,
          fekk_checkout_url: fekkUrl || null,
          description: description || null,
        }),
      });
      const data = (await res.json()) as { error?: string; event?: TourEvent };
      if (!res.ok || data.error) {
        setError(data.error ?? "Could not save show.");
        return;
      }
      if (data.event) {
        setEvents((list) =>
          [...list, data.event!].sort((a, b) =>
            a.starts_at.localeCompare(b.starts_at),
          ),
        );
        setMessage("Show added — fans can buy tickets via FEKK.");
        reset();
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this show?")) return;
    const res = await fetch(`/api/artist/tour-events/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setEvents((list) => list.filter((e) => e.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
          Fan city demand
        </h2>
        <p className="mt-2 text-sm text-white/45">
          Fans request cities from your public portal. Use this to plan tours.
        </p>
        {!demandReady ? (
          <p className="mt-3 text-sm text-[#F5A623]">
            {storeError ||
              "Run 20260830_tour_demand_fekk.sql to enable city requests."}
          </p>
        ) : demand.length === 0 ? (
          <p className="mt-3 text-sm text-white/35">
            No city requests yet — share your portal so fans can vote.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {demand.map((d) => (
              <li
                key={d.city}
                className="flex items-center justify-between rounded-xl border border-white/[0.08] px-4 py-3"
              >
                <div>
                  <p className="font-medium">{d.city}</p>
                  {d.place ? (
                    <p className="text-xs text-white/40">{d.place}</p>
                  ) : null}
                </div>
                <p className="text-sm tabular-nums text-[#1DB954]">
                  {d.requestCount} request{d.requestCount === 1 ? "" : "s"}
                  <span className="ml-2 text-white/35">
                    · {d.uniqueFans} fan{d.uniqueFans === 1 ? "" : "s"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/45">
              Shows & tickets (FEKK)
            </h2>
            <p className="mt-2 text-sm text-white/45">
              Publish dates; ticket checkout runs through FEKK. Link a FEKK event
              ID or checkout URL when live.
            </p>
          </div>
          {ready && !showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black"
            >
              Add show
            </button>
          ) : null}
        </div>

        {!ready ? (
          <p className="mt-3 text-sm text-[#F5A623]">
            Run 20260830_tour_demand_fekk.sql in Supabase.
          </p>
        ) : null}

        {message ? (
          <p className="mt-3 text-sm text-[#1DB954]">{message}</p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-[#F5A623]">{error}</p> : null}

        {showForm ? (
          <form
            onSubmit={(e) => void save(e)}
            className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <label className="block">
              <span className="text-xs text-white/45">Title</span>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-white/45">City</span>
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-white/45">Venue</span>
                <input
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block sm:col-span-1">
                <span className="text-xs text-white/45">Starts</span>
                <input
                  required
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-white/45">Ticket (XOF)</span>
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-white/45">Capacity</span>
                <input
                  type="number"
                  min={0}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs text-white/45">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-white/45">FEKK event ID</span>
                <input
                  value={fekkId}
                  onChange={(e) => setFekkId(e.target.value)}
                  placeholder="Optional"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs text-white/45">FEKK checkout URL</span>
                <input
                  value={fekkUrl}
                  onChange={(e) => setFekkUrl(e.target.value)}
                  placeholder="https://…"
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
              >
                {saving ? "Saving…" : "Publish show"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-white/70"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <ul className="mt-6 space-y-3">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/[0.08] px-4 py-3"
            >
              <div>
                <p className="font-medium">{ev.title}</p>
                <p className="text-xs text-white/45">
                  {ev.city}
                  {ev.venue ? ` · ${ev.venue}` : ""} ·{" "}
                  {new Date(ev.starts_at).toLocaleString()}
                  {!ev.active ? " · Hidden" : ""}
                </p>
                <p className="mt-1 text-xs text-white/35">
                  {ev.tickets_sold} sold
                  {ev.ticket_price_xof != null
                    ? ` · ${ev.ticket_price_xof.toLocaleString()} XOF`
                    : ""}
                  {ev.fekk_event_id ? ` · FEKK ${ev.fekk_event_id}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void remove(ev.id)}
                className="text-xs text-red-300/80"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
