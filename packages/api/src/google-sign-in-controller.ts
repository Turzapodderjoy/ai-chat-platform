import { GoogleSignInService } from "@ai-chat-platform/client-auth";

export class GoogleSignInController {
  constructor(private readonly googleSignIn: GoogleSignInService) {}

  async getConfig(businessId: string) {
    return this.googleSignIn.getConfig(businessId);
  }

  async upsert(data: { businessId: string; clientId: string | null; enabled: boolean }) {
    return this.googleSignIn.upsert(data);
  }

  async delete(businessId: string) {
    return this.googleSignIn.delete(businessId);
  }
}
