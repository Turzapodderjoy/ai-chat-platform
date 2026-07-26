import type { TenantContext } from "./types";

let current: TenantContext | null = null;

export function setTenantContext(
  context: TenantContext
) {
  current = context;
}

export function getTenantContext() {
  if (!current) {
    throw new Error("Tenant context not set.");
  }

  return current;
}

export function clearTenantContext() {
  current = null;
}