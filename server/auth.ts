import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const jwtSecret = process.env.JWT_SECRET ?? "";
if (!jwtSecret && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET is required in production");
}
const effectiveJwtSecret = jwtSecret || "local-dev-secret-change-before-production";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, effectiveJwtSecret, { expiresIn: "7d" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  if (!token) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const user = jwt.verify(token, effectiveJwtSecret) as AuthUser;
    const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(user.id);
    if (!exists) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}
