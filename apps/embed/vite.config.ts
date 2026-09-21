import { defineConfig } from "vite";

export default defineConfig({
  // Vite defaults (5173 / 4173) overlap Windows Hyper-V excluded ranges and
  // fail with EACCES on ::1. Bind IPv4 on ports outside those ranges.
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4180,
    strictPort: true,
  },
  build: {
    lib: {
      entry: "src/embed.ts",
      name: "SchedflowEmbed",
      formats: ["iife"],
      fileName: () => "embed.js",
    },
    outDir: "dist",
    emptyOutDir: true,
    minify: "esbuild",
    target: "es2018",
  },
});
