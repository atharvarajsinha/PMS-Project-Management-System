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
        // New deploys take over on their own: a "prompt" update could stay stuck behind an old
        // cached build that never got far enough to show the Reload toast.
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg", "icons/apple-touch-180.png"],
        manifest: {
          name: "PMS : Project Management System",
          short_name: "PMS",
          start_url: "/",
          display: "standalone",
          background_color: "#000000",
          theme_color: "#0D7BA8",
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
          skipWaiting: true, // activate a new service worker at once
          clientsClaim: true, // and let it control already-open tabs
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
    server: { proxy: { "/api": { target: proxyTarget, changeOrigin: true } } },
    build: {
      rollupOptions: {
        output: {
          // Vite 8 (Rolldown) only accepts manualChunks as a function
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "react";
            if (/node_modules[\\/]@radix-ui[\\/]react-(dialog|dropdown-menu|select|popover|tooltip)[\\/]/.test(id)) return "radix";
            if (/node_modules[\\/]lucide-react[\\/]/.test(id)) return "icons";
            return undefined;
          },
        },
      },
    },
  };
});
