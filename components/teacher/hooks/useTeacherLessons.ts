"use client";

import { useEffect, useState } from "react";
import {
  listFairSections,
  listLessons,
  listMyAccessRequests,
  listProgress,
  requestLessonAccess,
} from "@/lib/api";
import type { FairSection, Lesson, ProgressEntry, Session } from "@/types";

/**
 * Everything the teacher surface knows about a teacher's own lessons: what they
 * are assigned, how far through each one they got, which locked ones they have
 * already asked to unlock, and the ICT Fair projects if they have access.
 *
 * Lesson access shifts underneath the teacher — completing a lesson locks it and
 * starts the next one's wait — so `refreshLessons` is called after anything that
 * could have moved them along.
 */
export function useTeacherLessons(session: Session | null) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  // Self-reported position per lesson, so the welcome screen can offer to
  // resume ("you stopped on slide 8 of 11") instead of just "open".
  const [progressByLesson, setProgressByLesson] = useState<Record<string, ProgressEntry>>({});
  // Lesson ids with a pending access request to the super-admin.
  const [requestedLessonIds, setRequestedLessonIds] = useState<Set<string>>(
    () => new Set()
  );
  // Sections, with their projects nested. The server scopes them to the
  // teacher's own school — schools do not share fair projects.
  const [fairSections, setFairSections] = useState<FairSection[]>([]);

  useEffect(() => {
    listLessons()
      .then(setLessons)
      .catch(() => setLessons([]))
      .finally(() => setLessonsLoaded(true));
    refreshProgress();
    listMyAccessRequests()
      .then((reqs) =>
        setRequestedLessonIds(
          new Set(reqs.filter((r) => r.status === "pending").map((r) => r.lessonId))
        )
      )
      .catch(() => {});
  }, []);

  // Only once we know the teacher has been granted ICT Fair access.
  useEffect(() => {
    if (!session?.ictFairAccess) return;
    listFairSections().then(setFairSections).catch(() => setFairSections([]));
  }, [session?.ictFairAccess]);

  function refreshProgress() {
    listProgress()
      .then((rows) =>
        setProgressByLesson(Object.fromEntries(rows.map((r) => [r.lessonId, r])))
      )
      .catch(() => {});
  }

  // Re-pull lesson access state (statuses shift after a completion/unlock).
  function refreshLessons() {
    listLessons().then(setLessons).catch(() => {});
    refreshProgress();
  }

  /**
   * Teacher asks the super-admin to unlock a locked lesson. Optimistic, because
   * the button should settle immediately; `onError` reports a rollback so the
   * caller can say so in the teacher's own conversation.
   */
  async function requestAccess(lesson: Lesson, onError: (message: string) => void) {
    setRequestedLessonIds((prev) => new Set(prev).add(lesson.id));
    try {
      await requestLessonAccess(lesson.id);
    } catch {
      setRequestedLessonIds((prev) => {
        const next = new Set(prev);
        next.delete(lesson.id);
        return next;
      });
      onError(
        `I couldn't send your access request for "${lesson.title}" just now. Please try again in a moment.`
      );
    }
  }

  return {
    lessons,
    lessonsLoaded,
    progressByLesson,
    requestedLessonIds,
    fairSections,
    refreshLessons,
    requestAccess,
  };
}
