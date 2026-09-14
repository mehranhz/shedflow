import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/embed.ts",
      name: "SchedflowEmbed",
      formats: ["iife"],
      fileName: () => "embed.js",
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
