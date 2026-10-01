import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mombongo",
    short_name: "Mombongo",
    description: "Un espace pour les particuliers et les entreprises : factures, paiements et gestion du quotidien.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#065f46",
    icons: [
      { src: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
