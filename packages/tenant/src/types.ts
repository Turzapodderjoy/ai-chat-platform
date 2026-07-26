export interface TenantContext {
  userId: string;
  businessId: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "AGENT";
}