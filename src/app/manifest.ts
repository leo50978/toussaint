import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vichly Messenger",
    short_name: "Vichly",
    description:
      "Messagerie business intelligente, installable, avec IA, status et brouillons.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#efe8d8",
    theme_color: "#0f5c4d",
    lang: "fr-FR",
    categories: ["business", "productivity", "communication"],
    icons: [
      {
        src: "/pwa/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pwa/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
