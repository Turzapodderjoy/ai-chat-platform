import type { Document } from "./document";

export class KnowledgeBase {
  private documents: Document[] = [];

  add(document: Document) {
    this.documents.push(document);
  }

  all() {
    return this.documents;
  }

  get(id: string) {
    return this.documents.find((d) => d.id === id);
  }

  remove(id: string) {
    this.documents = this.documents.filter((d) => d.id !== id);
  }

  clear() {
    this.documents = [];
  }

  search(query: string): string[] {
    const q = query.toLowerCase();

    return this.documents
      .filter(
        (doc) =>
          doc.title.toLowerCase().includes(q) ||
          doc.content.toLowerCase().includes(q)
      )
      .map((doc) => doc.content);
  }
}