import { Document } from "./document";
import { Chunker } from "./chunker";
import { Retriever } from "./retriever";

export class KnowledgeBase {
  private documents: Document[] = [];

  private chunker = new Chunker();

  private retriever = new Retriever();

  add(document: Document) {
    this.documents.push(document);
  }

  search(query: string) {
    const results: string[] = [];

    for (const doc of this.documents) {
      const chunks = this.chunker.split(doc.content);

      results.push(...this.retriever.retrieve(query, chunks));
    }

    return results;
  }
}