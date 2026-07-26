export class KeywordScorer {
  score(
    query: string,
    text: string
  ): number {
    const words = query
      .toLowerCase()
      .split(/\s+/);

    const content = text.toLowerCase();

    let score = 0;

    for (const word of words) {
      if (content.includes(word)) {
        score++;
      }
    }

    return score;
  }
}