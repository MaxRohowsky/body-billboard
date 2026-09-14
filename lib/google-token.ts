const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

type GoogleClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  exp?: number;
  iat?: number;
};

type GoogleJwk = JsonWebKey & { kid?: string };
type CachedKeys = { expiresAt: number; keys: GoogleJwk[] };
let cachedKeys: CachedKeys | null = null;

function decodePart(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes;
}

function parseJsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodePart(value))) as T;
}

async function getGoogleKeys() {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) return cachedKeys.keys;

  const response = await fetch(GOOGLE_JWKS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("Google sign-in verification is temporarily unavailable.");
  const payload = (await response.json()) as { keys?: GoogleJwk[] };
  if (!Array.isArray(payload.keys)) throw new Error("Google returned invalid signing keys.");

  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  cachedKeys = { keys: payload.keys, expiresAt: Date.now() + Math.min(maxAge, 21600) * 1000 };
  return payload.keys;
}

export async function verifyGoogleCredential(credential: string, clientId: string) {
  const parts = credential.split(".");
  if (parts.length !== 3) throw new Error("Google returned an invalid credential.");

  const header = parseJsonPart<{ alg?: string; kid?: string }>(parts[0]);
  const claims = parseJsonPart<GoogleClaims>(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Google returned an unsupported credential.");

  const keys = await getGoogleKeys();
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) {
    cachedKeys = null;
    throw new Error("Google signing keys changed. Please try signing in again.");
  }

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const validSignature = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    decodePart(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!validSignature) throw new Error("Google could not verify this sign-in.");

  const now = Math.floor(Date.now() / 1000);
  const audienceMatches = Array.isArray(claims.aud) ? claims.aud.includes(clientId) : claims.aud === clientId;
  if (!claims.iss || !GOOGLE_ISSUERS.has(claims.iss)) throw new Error("Invalid Google issuer.");
  if (!audienceMatches) throw new Error("This Google sign-in belongs to another app.");
  if (!claims.exp || claims.exp <= now) throw new Error("This Google sign-in has expired.");
  if (claims.iat && claims.iat > now + 300) throw new Error("This Google sign-in is not valid yet.");
  if (!claims.sub || !claims.email || claims.email_verified !== true) {
    throw new Error("A verified Google account is required.");
  }

  return {
    sub: claims.sub.slice(0, 255),
    email: claims.email.slice(0, 320),
    name: claims.name?.slice(0, 120) ?? null,
    picture: claims.picture?.startsWith("https://") ? claims.picture.slice(0, 1000) : null,
  };
}
