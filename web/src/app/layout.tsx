import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { colorTokens } from "@/lib/tokens";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Arena", template: "%s · Arena" },
  description: "Contests decided by the people in the room. Vote from your phone; the prize pays out on its own.",
  applicationName: "Arena",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: colorTokens.bg.light },
    { media: "(prefers-color-scheme: dark)", color: colorTokens.bg.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set before paint by ThemeScript, so React must accept the DOM value.
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="bg-bg text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
