import { getSession } from "@/lib/session";
import { supabaseJson } from "@/lib/supabase";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(request);
  if (!user) return Response.json({ error: "Sign in with Google to upvote." }, { status: 401 });

  const { id } = await context.params;
  const listingId = Number(id);
  if (!Number.isSafeInteger(listingId) || listingId < 1) {
    return Response.json({ error: "That body does not exist." }, { status: 400 });
  }

  const voterSub = encodeURIComponent(user.sub);

  try {
    const listing = await supabaseJson<Array<{ id: number }>>(
      `/rest/v1/listings?id=eq.${listingId}&select=id&limit=1`,
    );
    if (!listing.length) return Response.json({ error: "That body does not exist." }, { status: 404 });

    const existing = await supabaseJson<Array<{ listing_id: number }>>(
      `/rest/v1/listing_votes?listing_id=eq.${listingId}&voter_sub=eq.${voterSub}&select=listing_id&limit=1`,
    );

    const upvoted = existing.length === 0;
    if (upvoted) {
      await supabaseJson<Array<{ listing_id: number }>>("/rest/v1/listing_votes?select=listing_id", {
        method: "POST",
        headers: { "content-type": "application/json", prefer: "return=representation" },
        body: JSON.stringify({ listing_id: listingId, voter_sub: user.sub }),
      });
    } else {
      await supabaseJson<unknown[]>(
        `/rest/v1/listing_votes?listing_id=eq.${listingId}&voter_sub=eq.${voterSub}`,
        { method: "DELETE", headers: { prefer: "return=representation" } },
      );
    }

    const votes = await supabaseJson<Array<{ listing_id: number }>>(
      `/rest/v1/listing_votes?listing_id=eq.${listingId}&select=listing_id`,
    );
    return Response.json({ upvoted, voteCount: votes.length });
  } catch (error) {
    console.error("listing vote failed", error);
    return Response.json({ error: "Could not update this upvote." }, { status: 500 });
  }
}
