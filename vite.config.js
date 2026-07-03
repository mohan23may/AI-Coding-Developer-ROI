import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static SPA. Deploys as-is to Vercel, Netlify, Cloudflare Pages, or GitHub Pages.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
});
