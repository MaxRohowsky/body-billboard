import { env } from "cloudflare:workers";
import { getSession } from "@/lib/session";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!env.DB) return Response.json({ error: "The marketplace is not available yet." }, { status: 503 });
  const user = await getSession(_request);
  if (!user) return Response.json({ error: "Sign in with Google to claim a body." }, { status: 401 });

  const { id } = await context.params;
  const listingId = Number(id);
  if (!Number.isSafeInteger(listingId) || listingId < 1) {
    return Response.json({ error: "That body does not exist." }, { status: 400 });
  }

  try {
    const result = await env.DB.prepare(
      "UPDATE listings SET claimed = 1, claimed_by_sub = ? WHERE id = ? AND claimed = 0",
    )
      .bind(user.sub, listingId)
      .run();

    if (!result.meta.changes) {
      const existing = await env.DB.prepare("SELECT claimed FROM listings WHERE id = ?")
        .bind(listingId)
        .first<{ claimed: number }>();
      return Response.json(
        { error: existing ? "That body was already claimed." : "That body does not exist." },
        { status: existing ? 409 : 404 },
      );
    }
    return Response.json({ claimed: true });
  } catch (error) {
    console.error("body claim failed", error);
    return Response.json({ error: "Could not claim this body right now." }, { status: 500 });
  }
}
