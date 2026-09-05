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

  async exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string) {
    return this.googleSignIn.exchangeCode(code, clientId, clientSecret, redirectUri);
  }

  async findOrCreateAccount(businessId: string, googleUser: { sub: string; email: string; name: string; picture: string }) {
    return this.googleSignIn.findOrCreateAccount(businessId, googleUser);
  }
}
