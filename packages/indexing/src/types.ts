export interface IndexRequest {
  filename: string;
  text: string;
  documentId?: string;
  metadata?: Record<string, unknown>;
}

export interface IndexResult {
  documentId: string;
  chunks: number;
  vectors: number;
}