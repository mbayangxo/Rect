export type ReleaseType = "single" | "ep" | "album" | "compilation";

export type ReleaseStatus =
  | "draft"
  | "validated"
  | "submitted"
  | "delivering"
  | "delivered"
  | "failed";

export type DeliveryStatus =
  | "pending"
  | "queued"
  | "processing"
  | "delivered"
  | "failed"
  | "not_configured";

export type TrackInput = {
  title: string;
  track_number?: number;
  isrc?: string | null;
  audio_url?: string | null;
  rect_external_id?: string | null;
  external_id?: string | null;
  duration_ms?: number | null;
};

export type CreateReleaseBody = {
  title: string;
  release_type?: ReleaseType;
  organization_id: string;
  tracks?: TrackInput[];
  rect_external_id?: string | null;
  rect_artist_external_id?: string | null;
  external_id?: string | null;
  artist_external_id?: string | null;
  upc?: string | null;
  release_date?: string | null;
  cover_url?: string | null;
  territories?: string[];
  dsp_targets?: string[];
};

export type ValidationIssue = {
  field: string;
  message: string;
  severity: "error" | "warning";
};

export type ReleaseRow = {
  id: string;
  organization_id: string;
  title: string;
  release_type: ReleaseType;
  status: ReleaseStatus;
  rect_external_id: string | null;
  rect_artist_external_id: string | null;
  upc: string | null;
  release_date: string | null;
  cover_url: string | null;
  territories: string[] | null;
  dsp_targets: string[] | null;
  validation_status: string | null;
  validation_issues: ValidationIssue[] | null;
  created_at: string;
  updated_at: string;
};

export type ReleaseTrackRow = {
  id: string;
  release_id: string;
  title: string;
  track_number: number;
  isrc: string | null;
  audio_url: string | null;
  rect_external_id: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type DeliveryRow = {
  id: string;
  release_id: string;
  organization_id: string;
  provider_id: string;
  destinations: string[];
  status: DeliveryStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
};
