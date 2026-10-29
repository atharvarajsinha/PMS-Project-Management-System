import { AlertCircle, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ErrorState({ error, onRetry }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" />
      <AlertTitle>Couldn't load this</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{error?.message || "Something went wrong."}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="text-foreground">
            <RotateCw className="size-4" /> Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
