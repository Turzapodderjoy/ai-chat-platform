export const PERMISSIONS = {
  OWNER: [
    "*"
  ],

  ADMIN: [
    "documents:*",
    "chat:*",
    "members:*",
    "settings:*"
  ],

  MANAGER: [
    "documents:read",
    "documents:write",
    "chat:*"
  ],

  AGENT: [
    "chat:read",
    "chat:write"
  ]
} as const;

export type Role = keyof typeof PERMISSIONS;