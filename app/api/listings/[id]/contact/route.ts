import { getSession } from "@/lib/session";
import { supabaseJson } from "@/lib/supabase";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSession(request);
  if (!user) return Response.json({ error: "Sign in with Google to contact the seller." }, { status: 401 });

  const { id } = await context.params;
  const listingId = Number(id);
  if (!Number.isSafeInteger(listingId) || listingId < 1) {
    return Response.json({ error: "That body does not exist." }, { status: 400 });
  }

  try {
    const rows = await supabaseJson<Array<{ contact: string | null }>>(
      `/rest/v1/listings?id=eq.${listingId}&select=contact&limit=1`,
    );
    if (!rows.length) return Response.json({ error: "That body does not exist." }, { status: 404 });
    if (!rows[0].contact) {
      return Response.json({ error: "This seller has not added contact details yet." }, { status: 409 });
    }
    return Response.json({ contact: rows[0].contact });
  } catch (error) {
    console.error("seller contact read failed", error);
    return Response.json({ error: "Could not load this seller's contact right now." }, { status: 500 });
  }
}
