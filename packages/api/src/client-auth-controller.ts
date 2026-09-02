import { ClientAuthService } from "@ai-chat-platform/client-auth";

export class ClientAuthController {
  constructor(private readonly clientAuth: ClientAuthService) {}

  listAccounts() {
    return this.clientAuth.list();
  }

  createAccount(businessId: string | null, username: string, password: string, isAdmin = false, isAgent = false, role: "owner" | "staff" | null = null) {
    return this.clientAuth.create(businessId, username, password, isAdmin, isAgent, role);
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

  setDisabled(id: string, disabled: boolean, changedBy: string) {
    return this.clientAuth.setDisabled(id, disabled, changedBy);
  }

  changePassword(id: string, newPassword: string, changedBy: string) {
    return this.clientAuth.changePassword(id, newPassword, changedBy);
  }

  activityHistory(id: string) {
    return this.clientAuth.activityHistory(id);
  }

  setAllowedPanels(id: string, panels: string[] | null, changedBy: string, allPanelIds: string[]) {
    return this.clientAuth.setAllowedPanels(id, panels, changedBy, allPanelIds);
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

  createTeam(businessId: string, name: string, parentTeamId: string | null) {
    return this.clientAuth.createTeam(businessId, name, parentTeamId);
  }

  listTeams(businessId: string) {
    return this.clientAuth.listTeams(businessId);
  }

  setTeamDefaultPanels(teamId: string, panels: string[] | null) {
    return this.clientAuth.setTeamDefaultPanels(teamId, panels);
  }

  deleteTeam(teamId: string) {
    return this.clientAuth.deleteTeam(teamId);
  }

  assignAccountToTeam(accountId: string, teamId: string | null) {
    return this.clientAuth.assignAccountToTeam(accountId, teamId);
  }

  listRolePresets(businessId: string) {
    return this.clientAuth.listRolePresets(businessId);
  }

  setRolePreset(businessId: string, role: "owner" | "staff", panels: string[] | null) {
    return this.clientAuth.setRolePreset(businessId, role, panels);
  }
}
