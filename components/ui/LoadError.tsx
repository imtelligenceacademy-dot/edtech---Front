"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * A load that failed, said out loud.
 *
 * The alternative is what several of these screens used to do: swallow the
 * error, stop loading, and render the empty state — so a dropped connection or
 * an expired session read as "No schools yet." or "No security events.", which
 * is a different claim entirely and one an admin can act on. Somebody reviewing
 * an incident was told there was nothing to review.
 *
 * Lifted out of the Files page, which already did this properly, so the other
 * screens say it the same way.
 */
export function LoadError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Card className={className ?? "mb-4 border-red-200 bg-red-50/60"}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <AlertCircle size={16} className="shrink-0 text-red-500" />
        <p className="flex-1 text-sm text-red-700">{message}</p>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </Card>
  );
}
