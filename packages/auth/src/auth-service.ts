import { prisma } from "@ai-chat-platform/database";

import {
  createAccessToken,
  createRefreshToken,
} from "./jwt";

import {
  hashPassword,
  verifyPassword,
} from "./password";

import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "./types";

export class AuthService {
  async register(
    request: RegisterRequest
  ): Promise<AuthResponse> {
    const exists = await prisma.user.findUnique({
      where: {
        email: request.email,
      },
    });

    if (exists) {
      throw new Error("Email already exists.");
    }

    const passwordHash = await hashPassword(
      request.password
    );

    const business = await prisma.business.create({
      data: {
        name: request.businessName,
        slug: crypto.randomUUID(),
      },
    });

    const user = await prisma.user.create({
      data: {
        name: request.name,
        email: request.email,
        passwordHash,
      },
    });

    await prisma.membership.create({
      data: {
        userId: user.id,
        businessId: business.id,
        role: "OWNER",
      },
    });

    const accessToken = createAccessToken(user.id);
    const refreshToken = createRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ),
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async login(
    request: LoginRequest
  ): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: {
        email: request.email,
      },
    });

    if (!user) {
      throw new Error("Invalid credentials.");
    }

    const ok = await verifyPassword(
      request.password,
      user.passwordHash
    );

    if (!ok) {
      throw new Error("Invalid credentials.");
    }

    const accessToken = createAccessToken(user.id);
    const refreshToken = createRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ),
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}