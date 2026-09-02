"use client";

import { useEffect, useState } from "react";
import { getMyAiQuota } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AIQuota } from "@/types";

// How many questions the teacher has left.
//
// The limits were always there and never shown: a teacher's first notice was
// "you've reached the hourly limit", arriving mid-lesson with a class watching.
// Nothing about that was knowable in advance, though the numbers always were.
//
// It reports the window that will actually stop them first — whichever of the
// hour or the day has fewer left — because naming both invites doing the
// arithmetic yourself, and only one of them is the real ceiling right now.

/** Fetches the quota, and re-reads it whenever `refreshKey` changes. */
export function useAiQuota(refreshKey: unknown) {
  const [quota, setQuota] = useState<AIQuota | null>(null);

  useEffect(() => {
    let alive = true;
    getMyAiQuota()
      .then((q) => alive && setQuota(q))
      // A quota we cannot read is not worth an error in the teacher's face;
      // the limit still enforces itself server-side either way.
      .catch(() => alive && setQuota(null));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return quota;
}

type Binding = {
  remaining: number;
  limit: number;
  window: "hour" | "day";
  resetsAt?: string | null;
};

/** The window that will stop them first. Null when neither limit applies. */
export function bindingWindow(quota: AIQuota | null | undefined): Binding | null {
  if (!quota) return null;

  const candidates: Binding[] = [];
  if (typeof quota.hourlyRemaining === "number") {
    candidates.push({
      remaining: quota.hourlyRemaining,
      limit: quota.hourlyLimit,
      window: "hour",
      resetsAt: quota.hourlyResetsAt,
    });
  }
  if (typeof quota.dailyRemaining === "number") {
    candidates.push({
      remaining: quota.dailyRemaining,
      limit: quota.dailyLimit,
      window: "day",
      resetsAt: quota.dailyResetsAt,
    });
  }
  if (candidates.length === 0) return null;

  return candidates.reduce((a, b) => (b.remaining < a.remaining ? b : a));
}

function atTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Beirut",
  });
}

export function quotaSentence(b: Binding): string {
  const per = b.window === "hour" ? "this hour" : "today";
  if (b.remaining === 0) {
    const at = atTime(b.resetsAt);
    // The windows roll, so this is never "at midnight" — it is one hour (or one
    // day) after the oldest question still inside the window.
    return at
      ? `No questions left ${per} — the next one at ${at}`
      : `No questions left ${per}`;
  }
  if (b.remaining === 1) return `1 question left ${per}`;
  return `${b.remaining} of ${b.limit} questions left ${per}`;
}

export function AiQuotaNote({
  quota,
  className,
}: {
  quota: AIQuota | null | undefined;
  className?: string;
}) {
  const binding = bindingWindow(quota);
  if (!binding) return null;

  const spent = binding.remaining === 0;
  // Quiet while there is room, legible once it starts to matter. Three is the
  // point where a teacher might reasonably change what they ask next.
  const low = binding.remaining > 0 && binding.remaining <= 3;

  return (
    <span
      className={cn(
        spent || low ? "font-medium text-amber-700" : "text-slate-500",
        className
      )}
    >
      {quotaSentence(binding)}
    </span>
  );
}
