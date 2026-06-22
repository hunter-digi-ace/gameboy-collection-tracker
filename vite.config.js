import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  // Change this to match your GitHub repository name
  base: "/gameboy-collection-tracker/",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
