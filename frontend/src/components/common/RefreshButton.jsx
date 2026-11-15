import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Refetch everything on the current page now (pages also auto-refresh every 10 s).
export default function RefreshButton() {
  const queryClient = useQueryClient();
  const fetching = useIsFetching() > 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh data"
          onClick={() => queryClient.refetchQueries({ type: "active" })}
        >
          <RefreshCw className={cn("size-4", fetching && "animate-spin")} aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Refresh (auto every 10 s)</TooltipContent>
    </Tooltip>
  );
}
