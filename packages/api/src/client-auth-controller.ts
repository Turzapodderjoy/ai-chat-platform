import { ClientAuthService } from "@ai-chat-platform/client-auth";

export class ClientAuthController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  listAccounts() {
    return this.clientAuth.list();
  }

  createAccount(businessId: string | null, username: string, password: string, isAdmin = false) {
    return this.clientAuth.create(businessId, username, password, isAdmin);
  }

  setDisabled(id: string, disabled: boolean) {
    return this.clientAuth.setDisabled(id, disabled);
  }

  setAllowedPanels(id: string, panels: string[] | null) {
    return this.clientAuth.setAllowedPanels(id, panels);
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
