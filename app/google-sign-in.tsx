"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { SessionUser } from "@/lib/session";

type GoogleCredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback(response: GoogleCredentialResponse): void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }): void;
          renderButton(
            element: HTMLElement,
            options: {
              type: "standard";
              theme: "outline";
              size: "large";
              text: "continue_with";
              shape: "rectangular";
              width: number;
            },
          ): void;
        };
      };
    };
  }
}

export function GoogleSignIn({ onSignedIn }: { onSignedIn(user: SessionUser): void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/config")
      .then(async (response) => {
        const payload = (await response.json()) as { clientId?: string | null };
        if (!response.ok || !payload.clientId) throw new Error("Google sign-in is not configured yet.");
        if (active) setClientId(payload.clientId);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Google sign-in is unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!scriptReady || !clientId || !buttonRef.current || !window.google) return;
    const button = buttonRef.current;
    button.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (response) => {
        if (!response.credential) {
          setError("Google did not return a credential.");
          return;
        }
        setSigningIn(true);
        setError("");
        void fetch("/api/auth/google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential: response.credential }),
        })
          .then(async (result) => {
            const payload = (await result.json()) as { user?: SessionUser; error?: string };
            if (!result.ok || !payload.user) throw new Error(payload.error || "Google sign-in failed.");
            onSignedIn(payload.user);
          })
          .catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "Google sign-in failed.");
          })
          .finally(() => setSigningIn(false));
      },
    });
    window.google.accounts.id.renderButton(button, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: 280,
    });
  }, [clientId, onSignedIn, scriptReady]);

  return (
    <div className="space-y-3">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => setError("Could not load Google sign-in.")}
      />
      <div ref={buttonRef} className={signingIn ? "pointer-events-none opacity-60" : ""} aria-busy={signingIn} />
      {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}
    </div>
  );
}
