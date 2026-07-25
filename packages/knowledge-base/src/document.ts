export interface Document {
  id: string;

  title: string;

  content: string;

  source: string;

  createdAt: Date;

  metadata: Record<string, any>;
}