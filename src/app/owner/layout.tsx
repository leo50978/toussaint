import type { Metadata } from "next";

export const metadata: Metadata = {
  manifest: "/owner-manifest.webmanifest",
};

export default function OwnerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
