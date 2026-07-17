/**
 * Supabase JWT verification middleware.
 *
 * Reads `Authorization: Bearer <token>` and verifies with Supabase's /auth/v1/user endpoint.
 * On success, sets req.userId. On failure, req.userId is undefined.
 *
 * Use verifyAuthRequired to reject requests with no valid token.
 */

import type { Request, Response, NextFunction } from "express";

// Public values — the anon key is intentionally shipped with the browser client
const SUPABASE_URL = "https://hajfuirqchzucmkeaxxd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhamZ1aXJxY2h6dWNta2VheHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDkwNTksImV4cCI6MjA5MjQyNTA1OX0.pzTjau8MGEFNpVu3lly5i3XPb6wpBAWZDB5BGg7Lls0";

interface SupabaseUserResponse {
  id?: string;
  [key: string]: unknown;
}

/** Resolve a Bearer token to a Supabase user ID. Returns null if invalid/expired. */
export async function resolveToken(token: string): Promise<string | null> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as SupabaseUserResponse;
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}

/** Middleware: populate req.userId if a valid Bearer token is present. Non-blocking. */
export async function populateAuth(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    (req as any).userId = await resolveToken(auth.slice(7));
  }
  next();
}
