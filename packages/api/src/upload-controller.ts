import { UploadService } from "@ai-chat-platform/upload";

export class UploadController {
  constructor(
    private readonly upload: UploadService
  ) {}

  async uploadFile(
    filepath: string,
    businessId: string
  ) {
    return this.upload.upload({
      filepath,
      businessId,
    });
  }
}