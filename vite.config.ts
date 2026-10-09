import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: true,
    allowedHosts: ["3000-iljykkc5k8zpykbce6bib-1b7b30b0.us3.manus.computer"],
  },
})
