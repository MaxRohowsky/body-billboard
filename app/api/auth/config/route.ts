import { env } from "cloudflare:workers";

export function GET() {
  return Response.json(
    { clientId: env.GOOGLE_CLIENT_ID ?? null },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
