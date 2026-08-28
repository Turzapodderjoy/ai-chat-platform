import { ClientAuthService } from "@ai-chat-platform/client-auth";

export class ClientAuthController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  listAccounts() {
    return this.clientAuth.list();
  }

  createAccount(businessId: string | null, username: string, password: string, isAdmin = false, isAgent = false) {
    return this.clientAuth.create(businessId, username, password, isAdmin, isAgent);
  }

  listAgents(businessId: string) {
    return this.clientAuth.listAgents(businessId);
  }

  setOnline(id: string, online: boolean) {
    return this.clientAuth.setOnline(id, online);
  }

  agentLimit(businessId: string) {
    return this.clientAuth.agentLimit(businessId);
  }

  setMaxAgents(businessId: string, max: number) {
    return this.clientAuth.setMaxAgents(businessId, max);
  }

  getAccount(id: string) {
    return this.clientAuth.getAccountById(id);
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
