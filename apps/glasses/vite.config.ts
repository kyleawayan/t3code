import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// The Even App loads this page from the Mac over the LAN during QR sideload,
// so the dev server must bind every interface, not just loopback.
const port = Number(process.env.PORT ?? 5741);

export default defineConfig({
  plugins: [react()],
  // Packed builds are served from inside the Even App at an unknown path, so
  // asset URLs must be relative.
  base: "./",
  server: { host: true, port, strictPort: true },
  build: { target: "esnext" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
