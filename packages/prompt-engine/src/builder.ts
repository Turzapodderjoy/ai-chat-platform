export class PromptBuilder {
  build(
    system: string,
    context: string[],
    user: string
  ) {
    return `
${system}

Context:

${context.join("\n\n")}

User:

${user}
`;
  }
}