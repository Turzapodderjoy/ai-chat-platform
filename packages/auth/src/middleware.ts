import jwt from "jsonwebtoken";

const SECRET =
  process.env.JWT_SECRET ?? "change-this";

export interface AuthRequest {
  userId: string;
}

export function authenticate(
  token: string
): AuthRequest {
  const payload = jwt.verify(
    token,
    SECRET
  ) as {
    userId: string;
  };

  return {
    userId: payload.userId,
  };
}