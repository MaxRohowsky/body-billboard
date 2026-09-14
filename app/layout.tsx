import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Body Billboard — The human billboard market",
  description: "List your body ad space, share your contact, and find a sponsor.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
