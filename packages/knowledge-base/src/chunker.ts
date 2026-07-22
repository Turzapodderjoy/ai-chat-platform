export class Chunker {
  split(text: string, size = 500): string[] {
    const chunks: string[] = [];

    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.slice(i, i + size));
    }

    return chunks;
  }
}