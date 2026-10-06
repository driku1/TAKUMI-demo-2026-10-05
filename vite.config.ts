import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  // Relative asset paths: the built app also works when served from a sub-folder.
  base: "./",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173 },
});
