import { ApplicationContainer } from "./container";

export class ApplicationBuilder {
  static async build(): Promise<ApplicationContainer> {
    throw new Error(
      "ApplicationBuilder is not implemented yet. Required services (ConversationService, IngestionPipeline, IndexingService, etc.) are not wired."
    );
  }
}