import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Body Billboard — The human billboard market",
  description: "List your body, get claimed by a sponsor, and wear their sticker.",
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
