import { ChatController } from "./chat-controller";
import { UploadController } from "./upload-controller";
import { HealthController } from "./health-controller";

export class ApiRouter {
  constructor(
    readonly chat: ChatController,
    readonly upload: UploadController,
    readonly health: HealthController
  ) {}
}