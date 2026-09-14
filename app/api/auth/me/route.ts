import { env } from "cloudflare:workers";
import { clearSessionCookie, currentSessionId, getSession } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";

export async function GET(request: Request) {
  const user = await getSession(request);
  return Response.json(
    { user: user ? { ...user, isAdmin: isAdminEmail(user.email) } : null },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  const sessionId = await currentSessionId(request);
  if (sessionId && env.DB) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }
  return Response.json(
    { signedOut: true },
    { headers: { "set-cookie": clearSessionCookie(request), "cache-control": "no-store" } },
  );
}
