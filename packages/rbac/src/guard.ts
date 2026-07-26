import { PERMISSIONS, Role } from "./permissions";

export function hasPermission(
  role: Role,
  permission: string
): boolean {
  const allowed: readonly string[] = PERMISSIONS[role] ?? [];

  // Full access permission
  if (allowed.includes("*")) {
    return true;
  }

  // Exact permission match
  if (allowed.includes(permission)) {
    return true;
  }

  // Wildcard permission match
  const [resource] = permission.split(":");
  const wildcardPermission = `${resource}:*`;

  return allowed.includes(wildcardPermission);
}