import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // 127.0.0.1, not localhost: Node may resolve localhost to ::1 while Django listens on IPv4 only
  const proxyTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        includeAssets: ["favicon.svg", "icons/apple-touch-180.png"],
        manifest: {
          name: "PMS — Project Management System",
          short_name: "PMS",
          start_url: "/",
          display: "standalone",
          background_color: "#0B0907",
          theme_color: "#F97316",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          globIgnores: ["**/mockServiceWorker.js"],
          runtimeCaching: [], // never cache API responses (auth cookies, tenant data)
        },
      }),
    ],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: { proxy: { "/api": { target: proxyTarget, changeOrigin: true } } },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            radix: [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-select",
              "@radix-ui/react-popover",
              "@radix-ui/react-tooltip",
            ],
            icons: ["lucide-react"],
          },
        },
      },
    },
  };
});
