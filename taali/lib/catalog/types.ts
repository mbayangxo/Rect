export type ReleaseStatus =
  | "draft"
  | "queued"
  | "submitted"
  | "processing"
  | "live"
  | "failed"
  | "takedown";

export type DeliveryStatus =
  | "pending"
  | "queued"
  | "submitted"
  | "processing"
  | "live"
  | "failed"
  | "rejected"
  | "takedown";

export type Release = {
  id: string;
  external_id: string | null;
  artist_external_id: string;
  title: string;
  upc: string | null;
  release_date: string | null;
  cover_url: string | null;
  territories: string[];
  dsp_targets: string[];
  status: ReleaseStatus;
  last_error: string | null;
  submitted_at: string | null;
  live_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Track = {
  id: string;
  release_id: string;
  external_id: string | null;
  title: string;
  isrc: string | null;
  audio_url: string;
  track_number: number;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

export type Delivery = {
  id: string;
  release_id: string;
  provider_id: string;
  status: DeliveryStatus;
  provider_ref: string | null;
  mode: "demo" | "live" | null;
  last_error: string | null;
  submitted_at: string | null;
  live_at: string | null;
  created_at: string;
  updated_at: string;
};
