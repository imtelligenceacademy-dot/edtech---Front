import { Badge } from "@/components/ui/Badge";
import type { WatchdogStatus } from "@/types";

const map: Record<WatchdogStatus, { label: string; tone: Parameters<typeof Badge>[0]["tone"] }> = {
  "on-track": { label: "On track", tone: "success" },
  late: { label: "Late", tone: "danger" },
  "not-opened": { label: "Not opened", tone: "warning" },
  completed: { label: "Completed", tone: "brand" },
  "needs-attention": { label: "Needs attention", tone: "warning" },
};

export function WatchdogBadge({ status }: { status: WatchdogStatus }) {
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
