import type { Metadata, Viewport } from "next";

import RegisterServiceWorker from "@/components/pwa/register-service-worker";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vichly Messenger",
  description: "Messagerie business intelligente avec fondation Firebase et IA.",
  applicationName: "Vichly Messenger",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vichly Messenger",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/pwa/icon.svg",
    shortcut: "/pwa/icon.svg",
    apple: "/pwa/icon.svg",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#081018",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="app-root antialiased">
        <div className="app-content-layer">
          <RegisterServiceWorker />
          {children}
        </div>
      </body>
    </html>
  );
}
