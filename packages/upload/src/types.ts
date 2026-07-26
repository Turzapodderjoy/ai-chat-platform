export interface UploadRequest {
  businessId: string;
  filepath: string;
}

export interface UploadResult {
  success: boolean;
  chunks: number;
}