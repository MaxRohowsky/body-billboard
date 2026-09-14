import { env } from "cloudflare:workers";
import { verifyGoogleCredential } from "@/lib/google-token";
import {
  createSessionToken,
  hashSessionToken,
  sessionCookie,
  sessionExpiry,
} from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";

export async function POST(request: Request) {
  if (!env.DB || !env.GOOGLE_CLIENT_ID) {
    return Response.json({ error: "Google sign-in is not configured yet." }, { status: 503 });
  }

  try {
    const payload = (await request.json()) as { credential?: unknown };
    const credential = typeof payload.credential === "string" ? payload.credential : "";
    if (!credential || credential.length > 5000) {
      return Response.json({ error: "Google returned an invalid credential." }, { status: 400 });
    }

    const googleUser = await verifyGoogleCredential(credential, env.GOOGLE_CLIENT_ID);
    const token = createSessionToken();
    const sessionId = await hashSessionToken(token);
    const expiresAt = sessionExpiry();

    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
      env.DB.prepare(
        `INSERT INTO sessions (id, google_sub, email, name, picture, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(sessionId, googleUser.sub, googleUser.email, googleUser.name, googleUser.picture, expiresAt),
    ]);

    return Response.json(
      {
        user: {
          sub: googleUser.sub,
          email: googleUser.email,
          name: googleUser.name,
          isAdmin: isAdminEmail(googleUser.email),
        },
      },
      { headers: { "set-cookie": sessionCookie(token, request), "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("google sign-in failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Google sign-in failed." },
      { status: 401 },
    );
  }
}
