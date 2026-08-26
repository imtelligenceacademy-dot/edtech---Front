"use client";

// Small per-browser preferences for the teacher surface. All of it is best
// effort: storage can be disabled, and nothing here is worth an error.

// The lesson in play is remembered per tab so a refresh mid-class doesn't lose
// it. The conversation itself lives on the server, one thread per lesson.
export const CHAT_STATE_KEY = "imt_teacher_chat_v1";
// Width of the lesson viewer as a % of the window — a per-teacher preference,
// so it outlives the tab.
export const PANE_WIDTH_KEY = "imt_lesson_pane_width";
// The grade a teacher last taught. They come back to the same one for weeks,
// so the gate points at it instead of asking them to remember.
const LAST_GRADE_KEY = "imt_last_grade";

export type SavedChat = {
  lastLessonId: string | null;
};

export function rememberGrade(grade: number) {
  try {
    window.localStorage.setItem(LAST_GRADE_KEY, String(grade));
  } catch {
    /* storage disabled — the gate just won't highlight anything */
  }
}

export function lastTaughtGrade(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LAST_GRADE_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function clearChatSession() {
  try {
    window.sessionStorage.removeItem(CHAT_STATE_KEY);
  } catch {
    /* private mode / storage disabled — nothing to clear */
  }
}
