import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-foreground px-4 py-2 text-xs font-medium text-background">
      <WifiOff className="size-4" aria-hidden />
      You're offline. Changes will not be saved.
    </div>
  );
}
