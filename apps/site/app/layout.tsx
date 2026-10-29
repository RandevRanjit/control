import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import "./tokens.css";
import "./globals.css";

const description =
  "A desktop and phone app for Claude Code. Every thread in one window, grouped your way, with a clear signal when one needs you. Free and open source.";

export const metadata: Metadata = {
  metadataBase: new URL(`${SITE_URL}/`),
  title: "Control: all your Claude Code threads in one window",
  description,
  openGraph: {
    title: "Control",
    description,
    url: "./",
    siteName: "Control",
    locale: "en_GB",
    type: "website",
    images: [{ url: "fig/app-field.jpg", width: 1512, height: 945 }],
  },
  twitter: { card: "summary_large_image" },
};

// The app's tokens switch on data-theme; the site follows the system before first paint.
const THEME_SCRIPT = `if (matchMedia("(prefers-color-scheme: dark)").matches) document.documentElement.dataset.theme = "night";`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" data-type="regrade" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
