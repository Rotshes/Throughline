import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The app lives in web/ so it does not sit alongside the pipeline in src/.
// Nothing under web/ may import from src/ — that code holds the OpenRouter,
// RAWG and Supabase keys and runs only in the function.
//
// data/ is the exception, and only three files in it. The category, platform
// and tag vocabularies are pinned files with no secrets, and the dropdowns are
// built from them at build time rather than fetched at run time: a form should
// not need a network round trip to know what it is allowed to offer, and the
// same pinned file then bounds both the interface and the function.
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    fs: {
      // Vite's dev server refuses reads outside its root. The build follows the
      // import graph regardless, so without this the app builds and deploys but
      // will not start locally — a difference between environments, which is
      // exactly the class of failure turn 003 spent six bugs on.
      allow: [path.resolve(process.cwd())],
    },
  },
});
