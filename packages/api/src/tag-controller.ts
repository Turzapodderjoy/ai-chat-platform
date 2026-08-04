import {
  TagService,
  TagAssignmentService,
  AnalyticsService,
  type AnalyticsFilters,
} from "@ai-chat-platform/tagging-pipeline";

/** Read/write surface for the tag catalog, manual tag assignment (the
 * only way tags ever get applied — no AI auto-tagging), and analytics
 * (including the custom pivot table). businessId present on a call =
 * client-scoped; absent = platform-wide (mother dashboard's Tags tab). */
export class TagController {
  constructor(
    private readonly tags: TagService,
    private readonly assignments: TagAssignmentService,
    private readonly analytics: AnalyticsService
  ) {}

  listTags(businessId?: string) {
    return this.tags.listTags(businessId);
  }

  createTag(params: { businessId?: string; label: string; color?: string | null; isFunnelStage?: boolean; funnelOrder?: number | null }) {
    if (!params.label.trim()) {
      throw new Error("Tag label is required.");
    }
    return this.tags.createTag(params);
  }

  updateTag(id: string, patch: { label?: string; color?: string | null; isFunnelStage?: boolean; funnelOrder?: number | null }) {
    return this.tags.updateTag(id, patch);
  }

  deleteTag(id: string) {
    return this.tags.deleteTag(id);
  }

  conversationTags(conversationId: string) {
    return this.assignments.conversationTags(conversationId);
  }

  conversationTagsForMany(conversationIds: string[]) {
    return this.assignments.conversationTagsForMany(conversationIds);
  }

  messageTagsForMany(messageIds: string[]) {
    return this.assignments.messageTagsForMany(messageIds);
  }

  assignTag(params: { conversationId?: string; messageId?: string; tagId: string }) {
    if (params.messageId) {
      return this.assignments.assignMessageTag(params.messageId, params.tagId);
    }
    if (params.conversationId) {
      return this.assignments.assignConversationTag(params.conversationId, params.tagId);
    }
    throw new Error("Either conversationId or messageId is required.");
  }

  removeTag(params: { conversationId?: string; messageId?: string; tagId: string }) {
    if (params.messageId) {
      return this.assignments.removeMessageTag(params.messageId, params.tagId);
    }
    if (params.conversationId) {
      return this.assignments.removeConversationTag(params.conversationId, params.tagId);
    }
    throw new Error("Either conversationId or messageId is required.");
  }

  getAnalytics(filters: AnalyticsFilters) {
    return this.analytics.getAnalytics(filters);
  }

  getPivot(params: {
    businessId: string;
    dimensions: string[];
    measure: "conversationCount" | "messageCount";
    from?: string;
    to?: string;
    tagIds?: string[];
    channel?: string;
  }) {
    if (params.dimensions.length === 0) {
      throw new Error("At least one dimension is required.");
    }
    return this.analytics.getPivot(params);
  }
}
