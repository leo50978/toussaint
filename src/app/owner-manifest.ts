import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/owner",
    name: "Vichly Owner",
    short_name: "Vichly Owner",
    description: "Dashboard owner installable pour piloter conversations, IA, statues et brouillons.",
    start_url: "/owner",
    scope: "/owner",
    display: "standalone",
    orientation: "portrait",
    background_color: "#081018",
    theme_color: "#081018",
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
