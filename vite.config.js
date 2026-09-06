import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app lives in web/ so it does not sit alongside the pipeline in src/.
// Nothing under web/ may import from src/ — that code holds the OpenRouter and
// Supabase keys and runs only in the function.
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
