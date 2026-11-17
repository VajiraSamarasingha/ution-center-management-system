import type { NextFunction, Request, Response } from "express";
import { auth } from "./firebase.js";

export type Role = "admin" | "manager" | "teacher" | "accountant" | "receptionist";

declare global {
  namespace Express {
    interface Request {
      user?: { uid: string; email?: string; role: Role };
    }
  }
}

const validRoles: Role[] = ["admin", "manager", "teacher", "accountant", "receptionist"];

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  try {
    const decoded = await auth.verifyIdToken(token, true);
    if (!decoded.email_verified) {
      res.status(403).json({ error: "Verify your email address before using the center workspace." });
      return;
    }
    const role = decoded.role;
    if (typeof role !== "string" || !validRoles.includes(role as Role)) {
      res.status(403).json({ error: "This account has no assigned staff role." });
      return;
    }
    req.user = { uid: decoded.uid, email: decoded.email, role: role as Role };
    next();
  } catch {
    res.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
  }
}

export function allowRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "You do not have permission to perform this action." });
      return;
    }
    next();
  };
}
