"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ExternalLink, ImagePlus, LoaderCircle, LogIn, LogOut, Sparkles, Trash2 } from "lucide-react";
import { toast, Toaster } from "sonner";
import type { SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GoogleSignIn } from "./google-sign-in";

type Listing = {
  id: number;
  description: string;
  imageUrl: string;
  createdAt: string;
};

type SellerContact = {
  listingId: number;
  contact: string;
};

type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input: unknown): unknown | Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function contactHref(contact: string) {
  const value = contact.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^@[A-Za-z0-9_]{1,15}$/.test(value)) return `https://x.com/${value.slice(1)}`;

  const candidate = /^https?:\/\//i.test(value)
    ? value
    : /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/:?#].*)?$/i.test(value)
      ? `https://${value}`
      : "";
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function BodyMarket() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [contactingId, setContactingId] = useState<number | null>(null);
  const [sellerContact, setSellerContact] = useState<SellerContact | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const listingsRef = useRef<Listing[]>([]);
  const userRef = useRef<SessionUser | null>(null);

  const loadListings = useCallback(async () => {
    try {
      const response = await fetch("/api/listings", { cache: "no-store" });
      const payload = (await response.json()) as { listings?: Listing[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load bodies.");
      setListings(payload.listings ?? []);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load bodies.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuth = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const payload = (await response.json()) as { user?: SessionUser | null };
      setUser(payload.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadListings(), loadAuth()]);
  }, [loadAuth, loadListings]);

  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const handleSignedIn = useCallback((signedInUser: SessionUser) => {
    setUser(signedInUser);
    setAuthOpen(false);
    toast.success("Signed in with Google.");
  }, []);

  const startListing = useCallback(() => {
    if (userRef.current) setSellOpen(true);
    else setAuthOpen(true);
  }, []);

  async function signOut() {
    await fetch("/api/auth/me", { method: "DELETE" });
    setUser(null);
    toast.success("Signed out.");
  }

  const contactSeller = useCallback(async (id: number) => {
    setContactingId(id);
    try {
      const response = await fetch(`/api/listings/${id}/contact`, { method: "POST" });
      const payload = (await response.json()) as { contact?: string; error?: string };
      if (response.status === 401) {
        setUser(null);
        setAuthOpen(true);
      }
      if (!response.ok || !payload.contact) throw new Error(payload.error || "Could not load this seller's contact.");
      setSellerContact({ listingId: id, contact: payload.contact });
      return payload.contact;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load this seller's contact.");
      throw error;
    } finally {
      setContactingId(null);
    }
  }, []);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const lifecycle = new AbortController();
    const reportError = (error: unknown) => console.error("WebMCP tool registration failed", error);
    const register = (tool: WebMcpTool) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(reportError);
      } catch (error) {
        reportError(error);
      }
    };

    register({
      name: "browse_bodies",
      title: "Browse bodies",
      description: "Return the bodies currently listed for sponsor ad space.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute() {
        return listingsRef.current.map(({ id, description }) => ({ id, description }));
      },
    });

    register({
      name: "start_body_listing",
      title: "Start body listing",
      description: "Open the listing form so the visitor can choose a photo and describe their event.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        if (!userRef.current) {
          setAuthOpen(true);
          return { opened: false, signInRequired: true };
        }
        setSellOpen(true);
        return { opened: true, signInRequired: false };
      },
    });

    register({
      name: "contact_body_seller",
      title: "Contact body seller",
      description: "Show the contact supplied by the person selling this body ad space.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", minimum: 1 } },
        required: ["id"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      async execute(input) {
        const id = typeof input === "object" && input !== null && "id" in input ? Number(input.id) : NaN;
        if (!Number.isSafeInteger(id) || id < 1) throw new Error("A valid body id is required.");
        if (!userRef.current) {
          setAuthOpen(true);
          throw new Error("Sign in with Google to contact the seller.");
        }
        const seller = await contactSeller(id);
        return { id, contact: seller };
      },
    });

    return () => lifecycle.abort();
  }, [contactSeller]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      toast.error("Use a JPG, PNG, or WebP photo.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Keep the photo under 5 MB.");
      event.target.value = "";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function submitListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo || !description.trim() || !contact.trim()) return;

    setSubmitting(true);
    const body = new FormData();
    body.set("photo", photo);
    body.set("description", description.trim());
    body.set("contact", contact.trim());

    try {
      const response = await fetch("/api/listings", { method: "POST", body });
      const payload = (await response.json()) as { listing?: Listing; error?: string };
      if (response.status === 401) {
        setUser(null);
        setSellOpen(false);
        setAuthOpen(true);
      }
      if (!response.ok || !payload.listing) throw new Error(payload.error || "Could not list your body.");

      setListings((current) => [payload.listing!, ...current]);
      setSellOpen(false);
      setDescription("");
      setContact("");
      setPhoto(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl("");
      formRef.current?.reset();
      toast.success("Your body is on the market.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not list your body.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteListing(id: number) {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/listings/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not delete this listing.");
      setListings((current) => current.filter((listing) => listing.id !== id));
      toast.success("Listing deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this listing.");
    } finally {
      setDeletingId(null);
    }
  }

  const sellerContactHref = sellerContact ? contactHref(sellerContact.contact) : null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Toaster position="bottom-center" richColors closeButton />
      <header className="border-b-2 border-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="#top" className="text-lg font-black tracking-[-0.04em]">body-billboard.com</a>
          <div className="flex items-center gap-4">
            <a href="#bodies" className="hidden text-sm font-bold underline decoration-2 underline-offset-4 sm:inline">Browse bodies</a>
            {authLoading ? (
              <span className="h-9 w-24 animate-pulse bg-secondary" aria-label="Checking sign-in" />
            ) : user ? (
              <Button variant="ghost" className="rounded-none px-2 font-bold" onClick={() => void signOut()} title={user.email}>
                <span className="max-w-28 truncate">{user.name?.split(" ")[0] || user.email}</span>
                <LogOut aria-hidden="true" />
              </Button>
            ) : (
              <Button variant="outline" className="rounded-none border-2 border-foreground font-black" onClick={() => setAuthOpen(true)}>
                <LogIn aria-hidden="true" /> Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="rounded-none border-2 border-foreground shadow-[8px_8px_0_var(--accent)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black tracking-[-0.04em]">Sign in first</DialogTitle>
            <DialogDescription className="text-base text-foreground/70">
              A Google account is required to list a body or contact a seller.
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2"><GoogleSignIn onSignedIn={handleSignedIn} /></div>
        </DialogContent>
      </Dialog>

      <section id="top" className="border-b-2 border-foreground">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1fr_0.7fr] lg:items-end">
          <div>
            <div className="mb-6 inline-flex rotate-[-2deg] items-center gap-2 border-2 border-foreground bg-accent px-3 py-1 text-sm font-black uppercase tracking-wide shadow-[3px_3px_0_#141414]">
              <Sparkles aria-hidden="true" className="size-4" />
              The human billboard market
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-[0.92] tracking-[-0.065em] sm:text-7xl lg:text-8xl">
              Have a body?<br />Sell the Ad-space!
            </h1>
          </div>
          <div className="lg:pb-2">
            <p className="mb-6 max-w-md text-lg leading-relaxed">
              List your body. Sponsors contact you. You wear their stuff.
            </p>
            <Button onClick={startListing} className="h-14 w-full rounded-none border-2 border-foreground bg-primary px-6 text-base font-black text-primary-foreground shadow-[5px_5px_0_var(--accent)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0_var(--accent)] sm:w-auto">
              + New Entry
            </Button>
            <Dialog open={sellOpen} onOpenChange={setSellOpen}>
              <DialogContent className="rounded-none border-2 border-foreground p-0 shadow-[8px_8px_0_var(--accent)] sm:max-w-xl">
                <form ref={formRef} onSubmit={submitListing}>
                  <DialogHeader className="border-b-2 border-foreground p-6">
                    <DialogTitle className="text-3xl font-black tracking-[-0.04em]">List your body</DialogTitle>
                    <DialogDescription className="text-base text-foreground/70">One clothed photo, one short pitch, and your preferred contact.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-5 p-6">
                    <label className="block">
                      <span className="mb-2 block text-sm font-black uppercase tracking-wide">Body photo</span>
                      <span className="relative flex min-h-44 cursor-pointer items-center justify-center overflow-hidden border-2 border-dashed border-foreground bg-secondary text-center focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ring">
                        {previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewUrl} alt="Your selected body" className="absolute inset-0 size-full object-cover" />
                        ) : (
                          <span className="flex flex-col items-center gap-2 p-6 font-bold">
                            <ImagePlus aria-hidden="true" className="size-7" />
                            Pick a JPG, PNG, or WebP
                            <span className="text-sm font-normal text-foreground/60">Maximum 5 MB</span>
                          </span>
                        )}
                        <Input
                          className="absolute inset-0 h-full cursor-pointer rounded-none border-0 opacity-0"
                          type="file"
                          name="photo"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handlePhoto}
                          required
                          aria-label="Choose a body photo"
                        />
                      </span>
                    </label>
                    <label className="block">
                      <span className="mb-2 flex items-center justify-between gap-4 text-sm font-black uppercase tracking-wide">
                        The pitch
                        <span className="font-normal normal-case tracking-normal text-foreground/50">{description.length}/240</span>
                      </span>
                      <Textarea
                        className="min-h-28 resize-none rounded-none border-2 border-foreground text-base shadow-none"
                        name="description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        maxLength={240}
                        placeholder="Running the Berlin Marathon. Your sticker gets 42 km of premium torso time."
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 flex items-center justify-between gap-4 text-sm font-black uppercase tracking-wide">
                        Contact
                        <span className="font-normal normal-case tracking-normal text-foreground/50">{contact.length}/200</span>
                      </span>
                      <Input
                        className="h-12 rounded-none border-2 border-foreground text-base shadow-none"
                        name="contact"
                        value={contact}
                        onChange={(event) => setContact(event.target.value)}
                        maxLength={200}
                        placeholder="Email, @X handle, or contact link"
                        required
                      />
                      <span className="mt-2 block text-sm text-foreground/60">Sponsors see this after signing in and pressing Buy Body.</span>
                    </label>
                    <p className="text-sm text-foreground/60">Keep it clothed, consensual, and legal.</p>
                  </div>
                  <DialogFooter className="border-t-2 border-foreground p-4 sm:items-center">
                    <DialogClose asChild><Button type="button" variant="ghost" className="rounded-none font-bold">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={submitting || !photo || !description.trim() || !contact.trim()} className="h-11 rounded-none border-2 border-foreground px-6 font-black">
                      {submitting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
                      List my body
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>

      <section className="border-b-2 border-foreground bg-secondary">
        <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
          <h2 className="mb-6 text-2xl font-black tracking-[-0.04em] sm:text-3xl">How it works</h2>
          <ol className="grid border-2 border-foreground bg-background sm:grid-cols-3">
            <li className="border-b-2 border-foreground p-5 sm:border-b-0 sm:border-r-2">
              <span className="mb-3 block text-3xl font-black text-primary">1.</span>
              <p className="text-base font-bold leading-relaxed">Submit a pic of you and contact details</p>
            </li>
            <li className="border-b-2 border-foreground p-5 sm:border-b-0 sm:border-r-2">
              <span className="mb-3 block text-3xl font-black text-primary">2.</span>
              <p className="text-base font-bold leading-relaxed">Write Pitch why you should be sponsored</p>
            </li>
            <li className="p-5">
              <span className="mb-3 block text-3xl font-black text-primary">3.</span>
              <p className="text-base font-bold leading-relaxed">Advertisers reach out to you</p>
            </li>
          </ol>
        </div>
      </section>

      <section id="bodies" className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-8 flex items-end justify-between gap-5 border-b-2 border-foreground pb-4">
          <div>
            <p className="mb-1 text-sm font-black uppercase tracking-[0.14em]">For sponsors</p>
            <h2 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">Bodies on the market</h2>
          </div>
          <ArrowDown aria-hidden="true" className="hidden size-7 sm:block" />
        </div>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center border-2 border-foreground bg-secondary">
            <LoaderCircle aria-hidden="true" className="size-6 animate-spin" /><span className="sr-only">Loading bodies</span>
          </div>
        ) : loadError ? (
          <div className="border-2 border-foreground bg-secondary p-8 text-center">
            <p className="font-bold">{loadError}</p>
            <Button variant="outline" className="mt-4 rounded-none border-2 border-foreground" onClick={() => void loadListings()}>Try again</Button>
          </div>
        ) : listings.length === 0 ? (
          <div className="grid min-h-52 place-items-center border-2 border-dashed border-foreground bg-secondary p-8 text-center">
            <div>
              <p className="text-2xl font-black tracking-tight">No bodies yet.</p>
              <button className="mt-2 font-bold underline decoration-2 underline-offset-4" onClick={startListing}>Put yours first.</button>
            </div>
          </div>
        ) : (
          <div className="divide-y-2 divide-foreground border-y-2 border-foreground">
            {listings.map((listing) => (
              <article key={listing.id} className="grid gap-5 py-5 sm:grid-cols-[112px_1fr_auto] sm:items-center">
                <div className="aspect-[4/3] overflow-hidden border-2 border-foreground bg-secondary sm:aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={listing.imageUrl} alt="Body available for a sponsor sticker" width={224} height={224} loading="lazy" className="size-full object-cover" />
                </div>
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-black">Body #{listing.id}</span>
                    <span className="border border-foreground px-2 py-0.5 text-xs font-black uppercase tracking-wide">Open for sponsors</span>
                  </div>
                  <p className="max-w-2xl text-base leading-relaxed text-foreground/75">{listing.description}</p>
                </div>
                <div className="flex flex-col gap-2 sm:items-stretch">
                  <Button
                    type="button"
                    disabled={contactingId === listing.id}
                    onClick={() => {
                      if (!userRef.current) {
                        setAuthOpen(true);
                        return;
                      }
                      void contactSeller(listing.id).catch(() => undefined);
                    }}
                    className="h-12 rounded-none border-2 border-foreground px-6 font-black sm:min-w-40"
                  >
                    {contactingId === listing.id ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
                    Buy Body
                  </Button>
                  {user?.isAdmin ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={deletingId === listing.id}
                          className="h-10 rounded-none border-2 border-foreground font-black"
                        >
                          {deletingId === listing.id ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-none border-2 border-foreground shadow-[8px_8px_0_var(--accent)]">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Body #{listing.id}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes the listing and its uploaded photo.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-none">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="rounded-none bg-destructive text-destructive-foreground"
                            onClick={() => void deleteListing(listing.id)}
                          >
                            Delete permanently
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <Dialog open={Boolean(sellerContact)} onOpenChange={(open) => { if (!open) setSellerContact(null); }}>
        <DialogContent className="rounded-none border-2 border-foreground shadow-[8px_8px_0_var(--accent)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-3xl font-black tracking-[-0.04em]">Contact Body #{sellerContact?.listingId}</DialogTitle>
            <DialogDescription className="text-base text-foreground/70">
              Work out the ad details directly with the seller.
            </DialogDescription>
          </DialogHeader>
          {sellerContact ? (
            <div className="border-2 border-foreground bg-secondary p-4 text-base font-bold break-words">
              {sellerContactHref ? (
                <a
                  href={sellerContactHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 underline decoration-2 underline-offset-4"
                >
                  {sellerContact.contact} <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                </a>
              ) : sellerContact.contact}
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild><Button type="button" className="rounded-none border-2 border-foreground font-black">Done</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <footer className="border-t-2 border-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-black">body-billboard.com</span>
          <span className="text-foreground/60">No money. No guarantees. Just stickers.</span>
        </div>
      </footer>
    </main>
  );
}
