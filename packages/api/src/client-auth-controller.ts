import { ClientAuthService } from "@ai-chat-platform/client-auth";

export class ClientAuthController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  listAccounts() {
    return this.clientAuth.list();
  }

  createAccount(businessId: string, username: string, password: string) {
    return this.clientAuth.create(businessId, username, password);
  }

  setDisabled(id: string, disabled: boolean) {
    return this.clientAuth.setDisabled(id, disabled);
  }

  deleteAccount(id: string) {
    return this.clientAuth.remove(id);
  }

  login(username: string, password: string, remember: boolean) {
    return this.clientAuth.login(username, password, remember);
  }

  getSession(token: string) {
    return this.clientAuth.getSession(token);
  }

  logout(token: string) {
    return this.clientAuth.logout(token);
  }
}
