export class Retriever {
  retrieve(query: string, chunks: string[]) {
    return chunks.filter(chunk =>
      chunk.toLowerCase().includes(query.toLowerCase())
    );
  }
}