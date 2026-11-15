import { defineConfig } from "vite";

export default defineConfig({
  server: { host: true, port: 5199, strictPort: true, allowedHosts: true },
  optimizeDeps: { include: ["ggwave", "qrcode", "@zxing/browser"] },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
});
