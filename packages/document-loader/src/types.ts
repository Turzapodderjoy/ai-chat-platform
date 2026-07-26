export interface LoadedDocument {
  filename: string;

  extension: string;

  text: string;

  size?: number;

  metadata?: Record<string, unknown>;
}