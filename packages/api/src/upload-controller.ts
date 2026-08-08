import { UploadService } from "@ai-chat-platform/upload";

export class UploadController {
  constructor(
    private readonly upload: UploadService
  ) {}

  async uploadFile(
    filepath: string,
    businessId: string,
    originalFilename: string
  ) {
    return this.upload.upload({
      filepath,
      businessId,
      originalFilename,
    });
  }
}