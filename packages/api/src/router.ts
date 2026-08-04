import { ChatController } from "./chat-controller";
import { UploadController } from "./upload-controller";
import { HealthController } from "./health-controller";
import { AdminController } from "./admin-controller";
import { HandoffController } from "./handoff-controller";
import { CrawlerController } from "./crawler-controller";
import { AiConfigController } from "./ai-config-controller";
import { EmbeddingController } from "./embedding-controller";
import { TrainingController } from "./training-controller";
import { ChannelController } from "./channel-controller";
import { FeedbackController } from "./feedback-controller";
import { AutoHealController } from "./auto-heal-controller";
import { TagController } from "./tag-controller";

export class ApiRouter {
  constructor(
    readonly chat: ChatController,
    readonly upload: UploadController,
    readonly health: HealthController,
    readonly admin: AdminController,
    readonly handoff: HandoffController,
    readonly crawler: CrawlerController,
    readonly aiConfig: AiConfigController,
    readonly embedding: EmbeddingController,
    readonly training: TrainingController,
    readonly channels: ChannelController,
    readonly feedback: FeedbackController,
    readonly autoHeal: AutoHealController,
    readonly tags: TagController
  ) {}
}
