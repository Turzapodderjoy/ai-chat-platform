export interface RetrievedChunk {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}