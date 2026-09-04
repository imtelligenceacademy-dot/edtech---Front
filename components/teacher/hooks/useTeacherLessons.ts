"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listFairSections,
  listLessons,
  listMyAccessRequests,
  listMyClasses,
  listProgress,
  requestLessonAccess,
} from "@/lib/api";
import type {
  ClassSummary,
  FairSection,
  Lesson,
  ProgressEntry,
  Session,
} from "@/types";

/**
 * Everything the teacher surface knows about a teacher's own lessons: what they
 * are assigned, how far through each one they got, which locked ones they have
 * already asked to unlock, and the ICT Fair projects if they have access.
 *
 * All of it is scoped to the class being taught. A teacher who takes 6A, 6B and
 * 6C walks three independent sequences, so the same lesson can be finished for
 * one class and still ahead for another — asking without saying which class
 * would answer for whichever one came first. `section` is "" for the teacher
 * who takes each grade once, which is the great majority and for whom none of
 * this is visible.
 *
 * Lesson access shifts underneath the teacher — completing a lesson locks it for
 * that class and starts the next one's wait — so `refreshLessons` is called
 * after anything that could have moved them along.
 */
export function useTeacherLessons(session: Session | null, section: string = "") {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  // Self-reported position per lesson, so the welcome screen can offer to
  // resume ("you stopped on slide 8 of 11") instead of just "open".
  const [progressByLesson, setProgressByLesson] = useState<Record<string, ProgressEntry>>({});
  // Lesson ids with a pending access request to the super-admin, for this class.
  const [requestedLessonIds, setRequestedLessonIds] = useState<Set<string>>(
    () => new Set()
  );
  // Where each of the teacher's classes has got to — what both pickers show.
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  // Sections, with their projects nested. The server scopes them to the
  // teacher's own school — schools do not share fair projects.
  const [fairSections, setFairSections] = useState<FairSection[]>([]);

  const refreshProgress = useCallback(() => {
    listProgress()
      .then((rows) =>
        setProgressByLesson(
          Object.fromEntries(
            rows.filter((r) => r.section === section).map((r) => [r.lessonId, r])
          )
        )
      )
      .catch(() => {});
  }, [section]);

  const refreshRequests = useCallback(() => {
    listMyAccessRequests()
      .then((reqs) =>
        setRequestedLessonIds(
          new Set(
            reqs
              .filter((r) => r.status === "pending" && r.section === section)
              .map((r) => r.lessonId)
          )
        )
      )
      .catch(() => {});
  }, [section]);

  // Re-runs when the teacher switches class, because every answer below is
  // about one class and none of it carries over.
  useEffect(() => {
    setLessonsLoaded(false);
    listLessons(section || undefined)
      .then(setLessons)
      .catch(() => setLessons([]))
      .finally(() => setLessonsLoaded(true));
    refreshProgress();
    refreshRequests();
    listMyClasses().then(setClasses).catch(() => setClasses([]));
  }, [section, refreshProgress, refreshRequests]);

  // Only once we know the teacher has been granted ICT Fair access.
  useEffect(() => {
    if (!session?.ictFairAccess) return;
    listFairSections().then(setFairSections).catch(() => setFairSections([]));
  }, [session?.ictFairAccess]);

  // Re-pull lesson access state (statuses shift after a completion/unlock).
  function refreshLessons() {
    listLessons(section || undefined).then(setLessons).catch(() => {});
    refreshProgress();
    listMyClasses().then(setClasses).catch(() => {});
  }

  /**
   * Teacher asks the super-admin to unlock a locked lesson for this class.
   * Optimistic, because the button should settle immediately; `onError` reports
   * a rollback so the caller can say so in the teacher's own conversation.
   */
  async function requestAccess(lesson: Lesson, onError: (message: string) => void) {
    setRequestedLessonIds((prev) => new Set(prev).add(lesson.id));
    try {
      await requestLessonAccess(lesson.id, section || undefined);
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
    classes,
    fairSections,
    refreshLessons,
    requestAccess,
  };
}
