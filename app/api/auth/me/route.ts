import { env } from "cloudflare:workers";
import { clearSessionCookie, currentSessionId, getSession } from "@/lib/session";

export async function GET(request: Request) {
  return Response.json(
    { user: await getSession(request) },
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
