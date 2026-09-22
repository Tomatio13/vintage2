import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  root: resolve(import.meta.dirname, "src/renderer"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src/renderer"),
      "@shared": resolve(import.meta.dirname, "src/shared"),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist/renderer"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
