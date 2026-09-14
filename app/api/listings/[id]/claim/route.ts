import { getSession } from "@/lib/session";
import { supabaseJson } from "@/lib/supabase";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSession(_request);
  if (!user) return Response.json({ error: "Sign in with Google to claim a body." }, { status: 401 });

  const { id } = await context.params;
  const listingId = Number(id);
  if (!Number.isSafeInteger(listingId) || listingId < 1) {
    return Response.json({ error: "That body does not exist." }, { status: 400 });
  }

  try {
    const updated = await supabaseJson<Array<{ id: number }>>(
      `/rest/v1/listings?id=eq.${listingId}&claimed=is.false&select=id`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify({ claimed: true, claimed_by_sub: user.sub }),
      },
    );

    if (!updated.length) {
      const existing = await supabaseJson<Array<{ claimed: boolean }>>(
        `/rest/v1/listings?id=eq.${listingId}&select=claimed&limit=1`,
      );
      return Response.json(
        { error: existing.length ? "That body was already claimed." : "That body does not exist." },
        { status: existing.length ? 409 : 404 },
      );
    }
    return Response.json({ claimed: true });
  } catch (error) {
    console.error("body claim failed", error);
    return Response.json({ error: "Could not claim this body right now." }, { status: 500 });
  }
}
