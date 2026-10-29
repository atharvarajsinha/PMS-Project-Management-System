import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./index.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import PwaUpdatePrompt from "@/components/common/PwaUpdatePrompt";
import { AuthProvider } from "@/context/AuthContext";
import { CollegeProvider } from "@/context/CollegeContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { queryClient } from "@/lib/queryClient";
import { router } from "@/routes";

async function enableMocks() {
  if (import.meta.env.VITE_USE_MOCKS !== "true") return;
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}

enableMocks().then(() => {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <CollegeProvider>
              <TooltipProvider delayDuration={300}>
                <RouterProvider router={router} />
                <Toaster richColors closeButton />
                {import.meta.env.VITE_USE_MOCKS !== "true" && <PwaUpdatePrompt />}
              </TooltipProvider>
            </CollegeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
});
