"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ArtistMerchItem, MerchCategory } from "@/lib/dashboard/artist-merch";
import { formatMerchPriceXof } from "@/lib/dashboard/artist-merch";

type Props = {
  initialItems: ArtistMerchItem[];
  storeReady: boolean;
  storeError: string | null;
  artistPortalHref: string;
};

const CATEGORIES: { id: MerchCategory; label: string }[] = [
  { id: "clothing", label: "Clothing" },
  { id: "digital", label: "Digital" },
  { id: "physical", label: "Physical" },
];

export function StudioMerchManager({
  initialItems,
  storeReady,
  storeError,
  artistPortalHref,
}: Props) {
  const router = useRouter();
  const photoRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(initialItems);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceXof, setPriceXof] = useState("");
  const [category, setCategory] = useState<MerchCategory>("physical");
  const [quantity, setQuantity] = useState("");
  const [photoItemId, setPhotoItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setTitle("");
    setDescription("");
    setPriceXof("");
    setCategory("physical");
    setQuantity("");
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(item: ArtistMerchItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setDescription(item.description ?? "");
    setPriceXof(String(item.price_xof));
    setCategory(item.category);
    setQuantity(
      item.quantity_available == null ? "" : String(item.quantity_available),
    );
    setShowForm(true);
    setError(null);
    setMessage(null);
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!storeReady || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      title,
      description: description.trim() || null,
      price_xof: Number(priceXof),
      category,
      quantity_available:
        quantity.trim() === "" ? null : Math.max(0, Math.round(Number(quantity))),
    };

    try {
      const res = await fetch(
        editingId ? `/api/artist/merch/${editingId}` : "/api/artist/merch",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        item?: ArtistMerchItem;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Could not save item.");
        return;
      }
      if (data.item) {
        setItems((list) => {
          const next = list.filter((i) => i.id !== data.item!.id);
          return [data.item!, ...next];
        });
        setMessage(editingId ? "Item updated." : "Item added to your store.");
        if (!editingId) {
          setPhotoItemId(data.item.id);
        }
        resetForm();
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(itemId: string, file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("photo", file);
      const res = await fetch(`/api/artist/merch/${itemId}/image`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        error?: string;
        item?: ArtistMerchItem;
      };
      if (!res.ok || data.error) {
        setError(data.error || "Photo upload failed.");
        return;
      }
      if (data.item) {
        setItems((list) =>
          list.map((i) => (i.id === data.item!.id ? data.item! : i)),
        );
        setMessage("Photo uploaded.");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUploading(false);
      setPhotoItemId(null);
    }
  }

  async function removeItem(itemId: string) {
    if (!confirm("Remove this item from your store?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/artist/merch/${itemId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) {
        setError(data.error || "Could not remove item.");
        return;
      }
      setItems((list) => list.filter((i) => i.id !== itemId));
      setMessage("Item removed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: ArtistMerchItem) {
    setSaving(true);
    try {
      const res = await fetch(`/api/artist/merch/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      const data = (await res.json()) as {
        error?: string;
        item?: ArtistMerchItem;
      };
      if (data.item) {
        setItems((list) =>
          list.map((i) => (i.id === data.item!.id ? data.item! : i)),
        );
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {!storeReady ? (
        <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          {storeError ||
            "Run 20260830_artist_merch_store.sql in Supabase to enable the store."}
        </p>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-[#1DB954]/30 bg-[#1DB954]/10 px-4 py-3 text-sm text-[#1DB954]">
          {message}
          {photoItemId ? (
            <>
              {" "}
              <button
                type="button"
                className="underline"
                onClick={() => photoRef.current?.click()}
              >
                Add a photo
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-[#F5A623]/30 bg-[#F5A623]/10 px-4 py-3 text-sm text-[#F5A623]">
          {error}
        </p>
      ) : null}

      <input
        ref={photoRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = photoItemId ?? editingId;
          if (file && id) void uploadPhoto(id, file);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/45">
          Active items appear on{" "}
          <a href={artistPortalHref} className="text-[#1DB954] hover:underline">
            your portal
          </a>
          . Fans pay through JOKO mobile money.
        </p>
        {storeReady && !showForm ? (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#17a349]"
          >
            Add merch item
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          onSubmit={(e) => void saveItem(e)}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/45">
            {editingId ? "Edit item" : "New merch item"}
          </h2>
          <label className="block">
            <span className="text-xs text-white/45">Title</span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[#1DB954]/50"
            />
          </label>
          <label className="block">
            <span className="text-xs text-white/45">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[#1DB954]/50"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-white/45">Price (XOF)</span>
              <input
                required
                type="number"
                min={0}
                value={priceXof}
                onChange={(e) => setPriceXof(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[#1DB954]/50"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/45">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MerchCategory)}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[#1DB954]/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-white/45">Quantity (blank = unlimited)</span>
              <input
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none focus:border-[#1DB954]/50"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-[#1DB954] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Add item"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-white/70"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {items.length === 0 && storeReady ? (
        <p className="text-sm text-white/40">
          No merch yet. Add your first item — it will show on your public portal
          when active.
        </p>
      ) : null}

      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => {
          const cover = item.image_urls[0];
          const soldOut =
            item.quantity_available != null && item.quantity_available <= 0;
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden"
            >
              <div className="aspect-[4/3] bg-black/40 relative">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-white/20 text-sm">
                    No photo
                  </div>
                )}
                {!item.active ? (
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-white/60">
                    Hidden
                  </span>
                ) : null}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs text-white/40 capitalize">
                      {item.category}
                      {soldOut ? " · Sold out" : ""}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-[#1DB954] shrink-0">
                    {formatMerchPriceXof(item.price_xof)}
                  </p>
                </div>
                {item.description ? (
                  <p className="text-xs text-white/45 line-clamp-2">
                    {item.description}
                  </p>
                ) : null}
                <p className="text-xs text-white/35">
                  {item.sales_count} sale{item.sales_count === 1 ? "" : "s"}
                  {item.quantity_available != null
                    ? ` · ${item.quantity_available} left`
                    : " · Unlimited stock"}
                  {item.image_urls.length > 1
                    ? ` · ${item.image_urls.length} photos`
                    : ""}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => {
                      setPhotoItemId(item.id);
                      photoRef.current?.click();
                    }}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:border-[#1DB954]/40"
                  >
                    {uploading && photoItemId === item.id
                      ? "Uploading…"
                      : "Add photo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(item)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70"
                  >
                    {item.active ? "Hide" : "Publish"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeItem(item.id)}
                    className="rounded-full border border-red-400/30 px-3 py-1.5 text-xs text-red-300/80"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
