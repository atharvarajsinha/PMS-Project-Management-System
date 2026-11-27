import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

// Registers the service worker. With registerType "autoUpdate" a new deploy activates and reloads
// the page on its own; the toast below only shows if an update ever waits for the user.
export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    toast("A new version is available", {
      duration: Infinity,
      action: { label: "Reload", onClick: () => updateServiceWorker(true) },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
