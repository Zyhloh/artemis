import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const resolvePath = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": resolvePath("./src"),
      "@components": resolvePath("./src/components"),
      "@windows": resolvePath("./src/windows"),
      "@tabs": resolvePath("./src/tabs"),
      "@hooks": resolvePath("./src/hooks"),
      "@context": resolvePath("./src/context"),
      "@lib": resolvePath("./src/lib"),
      "@styles": resolvePath("./src/styles")
    }
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: "dist",
    target: "chrome123",
    minify: true,
    sourcemap: false
  }
});
