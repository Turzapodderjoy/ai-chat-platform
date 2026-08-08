export interface UploadRequest {
  businessId: string;
  filepath: string;
  /** The customer's original filename (not the timestamp-prefixed disk
   * path) — used to build a stable documentId so re-uploading a file
   * with the same name replaces its old chunks instead of duplicating
   * them. */
  originalFilename: string;
}

export interface UploadResult {
  success: boolean;
  chunks: number;
}