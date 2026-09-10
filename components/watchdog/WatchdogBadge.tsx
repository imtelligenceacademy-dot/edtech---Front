import { Badge } from "@/components/ui/Badge";
import type { WatchdogStatus } from "@/types";

const map: Record<WatchdogStatus, { label: string; tone: Parameters<typeof Badge>[0]["tone"] }> = {
  "on-track": { label: "On track", tone: "success" },
  "not-opened": { label: "Not opened", tone: "warning" },
  completed: { label: "Completed", tone: "brand" },
  "needs-attention": { label: "Needs attention", tone: "warning" },
};

export function WatchdogBadge({ status }: { status: WatchdogStatus }) {
  // A row written before "late" was retired still carries it. It reads as
  // on-track, which is what it always was.
  const m = map[status] ?? map["on-track"];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
