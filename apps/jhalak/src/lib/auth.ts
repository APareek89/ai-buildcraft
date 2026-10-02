import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { q } from "./db";

const COOKIE = "jhalak_session";
const TTL_MS = 30 * 24 * 3600 * 1000;

function secret(): string {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("Set AUTH_SECRET to at least 32 random characters");
  return value;
}

export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}
export function verifyPassword(pw: string, hash: string): boolean {
  return bcrypt.compareSync(pw, hash);
}

export function signSession(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  const expected = createHmac("sha256", secret()).update(`${userId}.${exp}`).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return userId;
}

export async function getSessionUser(): Promise<{ id: string; email: string; name: string } | null> {
  const jar = await cookies();
  const userId = verifySessionToken(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const rows = await q<{ id: string; email: string; name: string }>(
    `select id, email, name from jhalak.users where id=$1`, [userId]
  );
  return rows[0] || null;
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, signSession(userId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: TTL_MS / 1000, path: "/",
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
}

/**
 * Ownership gate: legacy/demo businesses (owner_id null) stay open;
 * owned businesses require the owner's session.
 */
export async function canManageBusiness(bizId: string): Promise<boolean> {
  try {
    const rows = await q<{ owner_id: string | null }>(
      `select owner_id from jhalak.businesses where id=$1`, [bizId]
    );
    if (!rows.length) return false;
    if (!rows[0].owner_id) return true;
    const user = await getSessionUser();
    return !!user && user.id === rows[0].owner_id;
  } catch {
    return false; // malformed id or transient DB error → treat as not-authorized, never throw HTML
  }
}
