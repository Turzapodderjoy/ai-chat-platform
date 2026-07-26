import jwt from "jsonwebtoken";

const SECRET =
  process.env.JWT_SECRET ?? "change-this";

export function createAccessToken(userId: string) {
  return jwt.sign(
    { userId },
    SECRET,
    { expiresIn: "15m" }
  );
}

export function createRefreshToken(userId: string) {
  return jwt.sign(
    { userId },
    SECRET,
    { expiresIn: "30d" }
  );
}

export function verifyToken(token: string) {
  return jwt.verify(token, SECRET);
}