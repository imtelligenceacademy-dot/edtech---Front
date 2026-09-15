import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Component and hook tests. The suite that was missing: until now this repo's
// only checks were `tsc --noEmit`, `next lint` and a build, none of which can
// tell you whether a fix actually fixed anything — so every frontend change was
// shipped on a careful read.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Same "@/..." the app uses, so a test imports a module by the path the
    // application spells it with.
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    restoreMocks: true,
  },
});
