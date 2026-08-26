"use client";

import { descriptivePart } from "@/lib/teacher/lesson-order";
import type { Lesson } from "@/types";

// What a teacher's message means before it reaches the model. Lesson actions
// ("open the buzzer lesson", "I finished this") are handled by the app itself,
// so they never cost an API call and never get a chatty answer.

// Maps "first/second/…", "one/two/…", "1st/2nd/…" to a lesson number.
const WORD_NUMBERS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
};

// Resolve an "open lesson" request against the teacher's real assigned lessons.
// Handles the full title, a descriptive keyword ("buzzer", "light sensor"),
// "grade N lesson M", a bare "lesson N", and ordinals ("the first lesson").
export function findLessonByText(input: string, lessons: Lesson[]): Lesson | null {
  const lower = input.toLowerCase();

  // 1. Direct title match (longest title first to prefer the most specific).
  const byTitle = [...lessons]
    .sort((a, b) => b.title.length - a.title.length)
    .find((l) => lower.includes(l.title.toLowerCase()));
  if (byTitle) return byTitle;

  // 2. Descriptive keyword from the title ("open the buzzer lesson").
  const byKeyword = [...lessons]
    .sort((a, b) => descriptivePart(b.title).length - descriptivePart(a.title).length)
    .find((l) => {
      const d = descriptivePart(l.title);
      return d.length >= 3 && lower.includes(d);
    });
  if (byKeyword) return byKeyword;

  // 3. Resolve a lesson number from digits, ordinals, or number words.
  // Number-words only count when the message actually mentions "lesson", so
  // casual "one"/"two" in a question doesn't accidentally open a lesson.
  const gradeMatch = lower.match(/grade\s*(\d{1,2})/);
  let lessonNo: number | null = null;
  const numMatch = lower.match(/lesson\s*0*(\d{1,3})/);
  if (numMatch) {
    lessonNo = Number(numMatch[1]);
  } else if (lower.includes("lesson")) {
    const words = lower.split(/[^a-z0-9]+/);
    for (const [word, n] of Object.entries(WORD_NUMBERS)) {
      if (words.includes(word)) {
        lessonNo = n;
        break;
      }
    }
  }

  if (lessonNo !== null) {
    let candidates = lessons.filter((l) => l.lessonNo === lessonNo);
    if (gradeMatch) {
      candidates = candidates.filter((l) => l.grade === Number(gradeMatch[1]));
    }
    // Unambiguous match wins; if several grades share the number, don't guess.
    if (candidates.length === 1) return candidates[0];
  }

  return null;
}

// Lesson-action intents the assistant handles itself (never sent to the LLM).
// "I finished/completed the lesson/pdf" / "mark the pdf as complete" -> mark done.
export const COMPLETE_INTENT =
  /\b(i(?:'ve| have)?\s*(?:just\s*)?(?:finished|done|completed)|(?:finished|completed|done with)\s+(?:the|this|my)\s+(?:lesson|pdf|presentation|deck)|mark(?:\s+(?:it|this|the\s+(?:lesson|pdf|presentation)))?\s+(?:as\s+)?complete|mark complete)\b/i;
// "open/start the next lesson" -> advance to the next lesson in the track.
export const NEXT_LESSON_INTENT =
  /\b(?:(?:open|start|go to|load|continue)\s+)?(?:the\s+)?next\s+(?:lesson|one)\b/i;
// "open my lesson" / "reopen this lesson" -> open the current/available lesson.
export const OPEN_LESSON_INTENT = /\breopen\b|\b(?:open|start|resume|continue|load|go to)\b[^.?!]*\blesson\b/i;

export function hasNamedLessonOpenIntent(text: string): boolean {
  return (
    /\b(?:open|load|go to)\b/i.test(text) ||
    /\b(?:start|resume|continue)\b(?!\s+by\b)[^.?!]*(?:\blesson\b|\bgrade\s*\d{1,2}\b)/i.test(text)
  );
}
