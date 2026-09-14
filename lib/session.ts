import { env } from "cloudflare:workers";

const COOKIE_NAME = "bb_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

export type SessionUser = {
  sub: string;
  email: string;
  name: string | null;
  isAdmin?: boolean;
};

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export async function hashSessionToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
}

export async function getSession(request: Request): Promise<SessionUser | null> {
  if (!env.DB) return null;
  const token = readCookie(request, COOKIE_NAME);
  if (!token || token.length > 256) return null;
  const sessionId = await hashSessionToken(token);
  return env.DB.prepare(
    `SELECT google_sub AS sub, email, name
     FROM sessions
     WHERE id = ? AND expires_at > CURRENT_TIMESTAMP`,
  )
    .bind(sessionId)
    .first<SessionUser>();
}

export async function currentSessionId(request: Request) {
  const token = readCookie(request, COOKIE_NAME);
  return token && token.length <= 256 ? hashSessionToken(token) : null;
}
