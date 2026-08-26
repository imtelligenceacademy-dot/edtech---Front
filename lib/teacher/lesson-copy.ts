"use client";

import type { Lesson } from "@/types";

// Wording the assistant uses about lessons, kept together so it reads as one
// voice rather than strings scattered through the UI.

// One-tap openers for teachers who don't know what to ask the assistant yet.
export const STARTER_PROMPTS = [
  "How should I introduce this lesson?",
  "What do students usually get wrong here?",
  "Give me a 5-minute starter activity",
];

// Friendly date for "available on …" countdowns.
export function formatUnlockDate(iso?: string | null): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  const days = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days <= 0) return "today";
  return `${dateStr} (in ${days} day${days === 1 ? "" : "s"})`;
}

// The message shown when a teacher tries to open a lesson that isn't available.
export function lessonLockMessage(lesson: Lesson): string {
  switch (lesson.accessStatus) {
    case "completed":
      return `You've already completed "${lesson.title}". It's now locked — please ask your admin for access if you need to reopen it.`;
    case "waiting":
      return `"${lesson.title}" will unlock ${formatUnlockDate(lesson.availableAt)} after your waiting period. To open it sooner, please ask your admin for access.`;
    default:
      return `"${lesson.title}" is locked. Finish your current lesson first — or ask your admin for access.`;
  }
}
