export interface TextChunk {
  id: string;

  index: number;

  content: string;

  startOffset: number;

  endOffset: number;

  tokenEstimate: number;
}