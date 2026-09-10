// Shared types for the file manager (/admin/files). Mirrors the tables in
// supabase/migrations/20260909000400_file_manager.sql.

export interface FileFolder {
  id: string;
  owner_admin_id: string;
  agency_id: string | null;
  parent_id: string | null;
  name: string;
  /** Materialised "/A/B/C", maintained by a DB trigger — read-only from the app. */
  path: string;
  depth: number;
  shared: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileObject {
  id: string;
  owner_admin_id: string;
  agency_id: string | null;
  folder_id: string | null;
  storage_path: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  checksum: string | null;
  shared: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Return shape of the `file_storage_report` RPC. */
export interface StorageReport {
  used_bytes: number;
  quota_bytes: number;
  pool: "agency" | "practice";
}

/** One entry the `file-upload` edge function refused (whole-batch reject). */
export interface RejectedUpload {
  path: string;
  reason: string;
}
