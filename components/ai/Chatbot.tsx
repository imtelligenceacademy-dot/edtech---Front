"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Plus,
  CheckCircle2,
  Bot,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Presentation,
  LogOut,
  ChevronDown,
  GraduationCap,
  Loader2,
  Lock,
  Clock,
  Maximize2,
  Minimize2,
  BellRing,
  TrendingUp,
  ArrowDown,
  Copy,
  Check,
  RotateCcw,
  Square,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from "lucide-react";
import { cn, initials, stripMarkdown } from "@/lib/utils";
import {
  getSession,
  logout,
  listLessons,
  listFairProjects,
  listMyAccessRequests,
  listProgress,
  requestLessonAccess,
  saveLessonProgress,
  streamTeacherAI,
} from "@/lib/api";
import { PdfCanvasViewer } from "@/components/lesson-viewer/PdfCanvasViewer";
import {
  gradePath,
  TEACHER_FAIR,
  TEACHER_HOME,
} from "@/lib/teacher-routes";
import type { AIMessage, FairProject, Lesson, ProgressEntry, Session } from "@/types";

// The chat lives in one browser tab for a whole class. A stray refresh used to
// wipe the session, so grade + transcript + the lesson in play are mirrored to
// sessionStorage and restored on mount ("New chat" and sign-out clear it).
const CHAT_STATE_KEY = "imt_teacher_chat_v1";
// Width of the lesson viewer as a % of the window — a per-teacher preference,
// so it outlives the tab.
const PANE_WIDTH_KEY = "imt_lesson_pane_width";

type SavedChat = {
  messages: AIMessage[];
  lastLessonId: string | null;
};

function clearChatSession() {
  try {
    window.sessionStorage.removeItem(CHAT_STATE_KEY);
  } catch {
    /* private mode / storage disabled — nothing to clear */
  }
}

// One-tap openers for teachers who don't know what to ask the assistant yet.
const STARTER_PROMPTS = [
  "How should I introduce this lesson?",
  "What do students usually get wrong here?",
  "Give me a 5-minute starter activity",
];


// Maps "first/second/…", "one/two/…", "1st/2nd/…" to a lesson number.
const WORD_NUMBERS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10,
};

// Strip the "Grade N Lesson NN" prefix to get the descriptive part, e.g.
// "Grade 7 Lesson 03 Buzzer" -> "buzzer".
function descriptivePart(title: string): string {
  return title
    .replace(/^grade\s*\d+\s*lesson\s*\d+\s*/i, "")
    .trim()
    .toLowerCase();
}

// Resolve an "open lesson" request against the teacher's real assigned lessons.
// Handles the full title, a descriptive keyword ("buzzer", "light sensor"),
// "grade N lesson M", a bare "lesson N", and ordinals ("the first lesson").
function findLessonByText(input: string, lessons: Lesson[]): Lesson | null {
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

// Friendly date for "available on …" countdowns.
function formatUnlockDate(iso?: string | null): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  const days = Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days <= 0) return "today";
  return `${dateStr} (in ${days} day${days === 1 ? "" : "s"})`;
}

// The message shown when a teacher tries to open a lesson that isn't available.
function lessonLockMessage(lesson: Lesson): string {
  switch (lesson.accessStatus) {
    case "completed":
      return `You've already completed "${lesson.title}". It's now locked — please ask your admin for access if you need to reopen it.`;
    case "waiting":
      return `"${lesson.title}" will unlock ${formatUnlockDate(lesson.availableAt)} after your waiting period. To open it sooner, please ask your admin for access.`;
    default:
      return `"${lesson.title}" is locked. Finish your current lesson first — or ask your admin for access.`;
  }
}

// Lesson-action intents the assistant handles itself (never sent to the LLM).
// "I finished/completed the lesson/pdf" / "mark the pdf as complete" -> mark done.
const COMPLETE_INTENT =
  /\b(i(?:'ve| have)?\s*(?:just\s*)?(?:finished|done|completed)|(?:finished|completed|done with)\s+(?:the|this|my)\s+(?:lesson|pdf|presentation|deck)|mark(?:\s+(?:it|this|the\s+(?:lesson|pdf|presentation)))?\s+(?:as\s+)?complete|mark complete)\b/i;
// "open/start the next lesson" -> advance to the next lesson in the track.
const NEXT_LESSON_INTENT =
  /\b(?:(?:open|start|go to|load|continue)\s+)?(?:the\s+)?next\s+(?:lesson|one)\b/i;
// "open my lesson" / "reopen this lesson" -> open the current/available lesson.
const OPEN_LESSON_INTENT = /\breopen\b|\b(?:open|start|resume|continue|load|go to)\b[^.?!]*\blesson\b/i;

function hasNamedLessonOpenIntent(text: string): boolean {
  return (
    /\b(?:open|load|go to)\b/i.test(text) ||
    /\b(?:start|resume|continue)\b(?!\s+by\b)[^.?!]*(?:\blesson\b|\bgrade\s*\d{1,2}\b)/i.test(text)
  );
}

// Relative order of courses within a grade/language track — mirrors the
// backend COURSE_ORDER so the whole track reads as one linear sequence
// (all python lessons, then all micro:bit lessons).
const COURSE_ORDER: Record<string, number> = { python: 1, microbit: 2 };
function courseOrder(l: Lesson): number {
  return COURSE_ORDER[l.course ?? ""] ?? 0;
}

// Order lessons by course first, then curriculum number, for sequential nav.
function byLessonNo(a: Lesson, b: Lesson): number {
  return (
    courseOrder(a) - courseOrder(b) ||
    (a.lessonNo ?? 0) - (b.lessonNo ?? 0) ||
    a.title.localeCompare(b.title)
  );
}

// Human label for a course code (for section headers in the lesson list).
function courseLabel(course?: string | null): string {
  if (course === "python") return "Python";
  if (course === "microbit") return "micro:bit";
  return "Lessons";
}

// Group lessons into course sections in curriculum order (python, then
// micro:bit, then anything else), each section sorted by lesson number.
function groupLessonsByCourse(
  lessons: Lesson[]
): { course: string | null | undefined; items: Lesson[] }[] {
  const groups = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const key = l.course ?? "";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(l);
  }
  return Array.from(groups.entries())
    .sort((a, b) => (COURSE_ORDER[a[0]] ?? 0) - (COURSE_ORDER[b[0]] ?? 0))
    .map(([course, items]) => ({
      course: course || null,
      items: items.sort(byLessonNo),
    }));
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
}

// The route decides which grade is in play (and whether this is the ICT Fair
// view); the component never picks one on its own, so Back and Forward move
// through the session the way a teacher expects.
export function Chatbot({
  grade = null,
  fair = false,
}: {
  grade?: number | null;
  fair?: boolean;
} = {}) {
  const router = useRouter();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [openedLesson, setOpenedLesson] = useState<Lesson | null>(null);
  const [openedSlide, setOpenedSlide] = useState(1);
  // The PDF page currently visible in the viewer. Sent with each question so the
  // assistant can inspect that exact slide. Desktop only; null = no visual context.
  const [viewedSlide, setViewedSlide] = useState<number | null>(null);
  // The last lesson opened this session. Kept after the pane is closed so the
  // side panel can offer to bring it back.
  const [lastLesson, setLastLesson] = useState<Lesson | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  const selectedGrade = grade;
  const [session, setSession] = useState<Session | null>(null);
  // The teacher experience is light-only.
  const light = true;
  const [fullscreenLesson, setFullscreenLesson] = useState<Lesson | null>(null);
  // ICT Fair (shown only to teachers granted access). View-only: a project
  // grid in the main area, and the picked project opens full-screen. No chat
  // grounding, no progress tracking.
  const [fairProjects, setFairProjects] = useState<FairProject[]>([]);
  const [fairViewer, setFairViewer] = useState<FairProject | null>(null);
  const showFairProjects = fair;
  // Lesson ids with a pending access request to the super-admin.
  const [requestedLessonIds, setRequestedLessonIds] = useState<Set<string>>(
    () => new Set()
  );
  // Self-reported position per lesson, so the welcome screen can offer to
  // resume ("you stopped on slide 8 of 11") instead of just "open".
  const [progressByLesson, setProgressByLesson] = useState<Record<string, ProgressEntry>>({});
  // The teacher is reading back through the transcript — don't yank them to the
  // bottom while a reply streams in.
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const suppressScrollUntilRef = useRef(0);
  // A reply is in flight and can be stopped; the last question is kept so a
  // failed turn can be retried without retyping it.
  const [streaming, setStreaming] = useState(false);
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Lesson viewer / chat split (desktop): draggable, and the chat can be folded
  // away entirely for full-width presenting.
  const [paneWidth, setPaneWidth] = useState(60);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  // Gate the "save" effect until the previous session has been restored, so an
  // empty first render can't overwrite it.
  const [restored, setRestored] = useState(false);
  const pendingLessonIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore the previous session (a refresh mid-class shouldn't cost the chat).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(CHAT_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SavedChat>;
        if (Array.isArray(saved.messages)) setMessages(saved.messages);
        pendingLessonIdRef.current = saved.lastLessonId ?? null;
      }
      const width = Number(window.localStorage.getItem(PANE_WIDTH_KEY));
      if (width >= 35 && width <= 80) setPaneWidth(width);
    } catch {
      /* unreadable storage — start fresh */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      const payload: SavedChat = {
        messages,
        lastLessonId: lastLesson?.id ?? null,
      };
      window.sessionStorage.setItem(CHAT_STATE_KEY, JSON.stringify(payload));
    } catch {
      /* quota / private mode — the session just won't survive a refresh */
    }
  }, [restored, messages, lastLesson]);

  // The restored lesson id only becomes a Lesson once the list has loaded.
  useEffect(() => {
    const id = pendingLessonIdRef.current;
    if (!id || lessons.length === 0) return;
    pendingLessonIdRef.current = null;
    const match = lessons.find((l) => l.id === id);
    if (match) setLastLesson(match);
  }, [lessons]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(PANE_WIDTH_KEY, String(Math.round(paneWidth)));
    } catch {
      /* preference just won't stick */
    }
  }, [restored, paneWidth]);

  useEffect(() => {
    getSession().then(setSession).catch(() => setSession(null));
    // Load the teacher's real assigned lessons (with their linked PDFs).
    listLessons()
      .then(setLessons)
      .catch(() => setLessons([]))
      .finally(() => setLessonsLoaded(true));
    // How far the teacher got in each lesson, for the "continue" card.
    refreshProgress();
    // Track which locked lessons the teacher has already asked to unlock.
    listMyAccessRequests()
      .then((reqs) =>
        setRequestedLessonIds(
          new Set(reqs.filter((r) => r.status === "pending").map((r) => r.lessonId))
        )
      )
      .catch(() => {});
  }, []);

  // Load ICT Fair projects once we know the teacher has been granted access.
  useEffect(() => {
    if (!session?.ictFairAccess) return;
    listFairProjects().then(setFairProjects).catch(() => setFairProjects([]));
  }, [session?.ictFairAccess]);

  useEffect(() => {
    if (!atBottomRef.current) return;
    scrollTranscriptToBottom();
  }, [messages, thinking]);

  // A smooth scroll fires scroll events all the way down, and every one of them
  // looks like "the teacher scrolled up" until the animation lands. Ignore the
  // transcript's own scrolling for the length of the animation.
  function scrollTranscriptToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    suppressScrollUntilRef.current = Date.now() + 800;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // Track how close to the bottom the transcript is scrolled. Anything within a
  // bubble's height counts as "following along".
  function onTranscriptScroll(e: React.UIEvent<HTMLDivElement>) {
    if (Date.now() < suppressScrollUntilRef.current) return;
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = near;
    setAtBottom((prev) => (prev === near ? prev : near));
  }

  function jumpToLatest() {
    atBottomRef.current = true;
    setAtBottom(true);
    scrollTranscriptToBottom();
  }

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 180) + "px";
    }
  }, [input]);

  function pushAssistant(content: string, extras: Partial<AIMessage> = {}) {
    setMessages((prev) => [
      ...prev,
      {
        id: `a_${Date.now()}`,
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
        ...extras,
      },
    ]);
  }

  // `retry` re-asks a question that's already in the transcript, so the failed
  // turn (and its error reply) must be trimmed off the history first.
  async function answerQuestion(text: string, retry = false) {
    let prior = messages;
    if (retry) {
      prior = [...messages];
      while (prior.length && prior[prior.length - 1].role === "assistant") prior.pop();
      if (prior.length && prior[prior.length - 1].role === "user") prior.pop();
    }
    // Prior turns become the conversation history; the backend appends `text`.
    const history = prior
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    const assistantId = `a_${Date.now()}`;
    let started = false;
    let sourceRef: string | undefined;
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    try {
      await streamTeacherAI(
        {
          message: text,
          lessonId: lessonForQuestions()?.id ?? null,
          currentSlide: viewedSlide,
          history,
        },
        {
          signal: controller.signal,
          onMeta: (m) => {
            sourceRef = m.sourceRef;
          },
          onDelta: (delta) => {
            if (!started) {
              started = true;
              setThinking(false);
              setMessages((prev) => [
                ...prev,
                {
                  id: assistantId,
                  role: "assistant",
                  content: delta,
                  timestamp: new Date().toISOString(),
                },
              ]);
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + delta } : m
                )
              );
            }
          },
        }
      );
      // Attach the lesson reference once the stream completes.
      if (started && sourceRef) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, sourceRef } : m))
        );
      }
      if (!started) {
        pushAssistant("I didn't get a response. Please try again.");
        setFailedPrompt(text);
      }
    } catch (err) {
      // Stopped on purpose — keep whatever streamed in and say nothing.
      if (controller.signal.aborted) return;
      // The backend sends a specific, already-safe reason (usage limit reached,
      // provider unavailable, timed out...). Prefer it over a generic line so the
      // teacher knows whether to retry now, wait, or ask an administrator.
      const reason = err instanceof Error ? err.message.trim() : "";
      const isNetwork =
        !reason || /failed to fetch|networkerror|load failed/i.test(reason);
      pushAssistant(
        isNetwork
          ? "I couldn't reach the assistant. Please check your connection and try again."
          : reason
      );
      setFailedPrompt(text);
    } finally {
      setThinking(false);
      setStreaming(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // Abandon the reply in flight. Whatever already streamed in stays on screen.
  function stopStreaming() {
    abortRef.current?.abort();
    abortRef.current = null;
    setThinking(false);
    setStreaming(false);
  }

  // Re-ask the last question that failed, dropping the error reply.
  function retryLast() {
    const text = failedPrompt;
    if (!text) return;
    setFailedPrompt(null);
    setMessages((prev) => {
      const next = [...prev];
      if (next.length && next[next.length - 1].role === "assistant") next.pop();
      return next;
    });
    setThinking(true);
    void answerQuestion(text, true);
  }

  // Re-pull lesson access state (statuses shift after a completion/unlock).
  function refreshLessons() {
    listLessons().then(setLessons).catch(() => {});
    refreshProgress();
  }

  function refreshProgress() {
    listProgress()
      .then((rows) => setProgressByLesson(Object.fromEntries(rows.map((r) => [r.lessonId, r]))))
      .catch(() => {});
  }

  // Teacher asks the super-admin to unlock a locked lesson.
  async function requestAccess(lesson: Lesson) {
    setRequestedLessonIds((prev) => new Set(prev).add(lesson.id)); // optimistic
    try {
      await requestLessonAccess(lesson.id);
    } catch {
      // Roll back the optimistic flag and surface a gentle error.
      setRequestedLessonIds((prev) => {
        const next = new Set(prev);
        next.delete(lesson.id);
        return next;
      });
      pushAssistant(
        `I couldn't send your access request for "${lesson.title}" just now. Please try again in a moment.`
      );
    }
  }

  function openLesson(lesson: Lesson) {
    // Sequential unlocking — a teacher can only open their current lesson.
    if (lesson.accessStatus && lesson.accessStatus !== "available") {
      pushAssistant(lessonLockMessage(lesson), { sourceRef: lesson.title });
      return;
    }
    if (showFairProjects) router.push(gradePath(lesson.grade));
    setOpenedLesson(lesson);
    setLastLesson(lesson);
    setOpenedSlide(1);
    setViewedSlide(null);
    const mobilePdf = Boolean(lesson.fileId) && isMobileViewport();
    if (mobilePdf) {
      setFullscreenLesson(lesson);
    }
    const detail = lesson.fileId
      ? mobilePdf
        ? "The lesson PDF is opening in the mobile viewer."
        : "The lesson PDF is open on the left — ask me anything about it here."
      : `${lesson.slides.length} slides. The deck is open on the left; ask me anything about a slide and I'll explain it here.`;
    pushAssistant(`Opening "${lesson.title}" — Grade ${lesson.grade}. ${detail}`, {
      sourceRef: lesson.title,
    });
  }

  // "I finished the lesson" — record the open lesson as complete.
  async function markCurrentComplete() {
    if (!openedLesson) {
      setThinking(false);
      pushAssistant(
        "Open a lesson first, then tell me you've finished and I'll mark it complete for you."
      );
      return;
    }
    const lesson = openedLesson;
    try {
      await saveLessonProgress(lesson.id, { complete: true });
      const fresh = await listLessons().catch(() => null);
      if (fresh) setLessons(fresh);
      pushAssistant(
        `Nice work — I've marked "${lesson.title}" as complete. Your next lesson unlocks after the waiting period; say "open the next lesson" and I'll open it once it's available.`,
        { sourceRef: lesson.title }
      );
    } catch {
      pushAssistant(
        `I couldn't mark "${lesson.title}" complete just now. You can also use the "Mark complete" button on the lesson. Please try again in a moment.`
      );
    } finally {
      setThinking(false);
    }
  }

  // "Open the next lesson" — advance in sequence. openLesson enforces access, so
  // a not-yet-finished current lesson or an active waiting period is explained.
  function openNextLesson() {
    setThinking(false);
    const sorted = [...gradeLessons].sort(byLessonNo);
    let next: Lesson | undefined;
    if (openedLesson) {
      const idx = sorted.findIndex((l) => l.id === openedLesson.id);
      next = idx >= 0 ? sorted[idx + 1] : undefined;
    } else {
      next = sorted.find((l) => l.accessStatus !== "completed");
    }
    if (!next) {
      pushAssistant("You're on the last lesson of this grade — there's no next one yet.");
      return;
    }
    openLesson(next);
  }

  // "Open my lesson" / "reopen this lesson" — open the current or next-available one.
  function openCurrentLesson() {
    setThinking(false);
    if (openedLesson) {
      openLesson(openedLesson);
      return;
    }
    const sorted = [...gradeLessons].sort(byLessonNo);
    const target =
      sorted.find((l) => l.accessStatus === "available") ??
      sorted.find((l) => l.accessStatus !== "completed") ??
      sorted[0];
    if (!target) {
      pushAssistant("You don't have any lessons in this grade yet.");
      return;
    }
    openLesson(target);
  }

  function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text) return;
    const userMsg: AIMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setFailedPrompt(null);
    // Sending is an intent to follow the answer.
    atBottomRef.current = true;
    setAtBottom(true);

    // Lesson actions are handled by the app itself (not the LLM):
    if (COMPLETE_INTENT.test(text)) {
      setThinking(true);
      void markCurrentComplete();
      return;
    }
    if (NEXT_LESSON_INTENT.test(text)) {
      openNextLesson();
      return;
    }
    if (hasNamedLessonOpenIntent(text)) {
      const named = findLessonByText(text, gradeLessons);
      if (named) {
        openLesson(named);
        return;
      }
    }
    if (OPEN_LESSON_INTENT.test(text)) {
      openCurrentLesson();
      return;
    }

    // Otherwise it's a question for the grounded AI assistant.
    setThinking(true);
    void answerQuestion(text);
  }

  const isEmpty = messages.length === 0;

  // The lesson the side panel acts on: whatever is open, else the last one
  // opened - resolved against `lessons` so its access status stays current.
  const panelTarget = openedLesson ?? lastLesson;
  const panelLesson = panelTarget
    ? lessons.find((l) => l.id === panelTarget.id) ?? panelTarget
    : null;

  // The lesson a question is grounded in. With the viewer closed the teacher is
  // still working on a lesson — the one they last had open, or the one they're
  // up to — so questions aren't answered with "open a lesson first". Only an
  // available lesson counts: the backend refuses locked and completed ones.
  function lessonForQuestions(): Lesson | null {
    if (openedLesson) return openedLesson;
    const isOpenable = (l: Lesson) => (l.accessStatus ?? "available") === "available";
    const last = lastLesson ? lessons.find((l) => l.id === lastLesson.id) : undefined;
    if (last && isOpenable(last)) return last;
    return [...gradeLessons].sort(byLessonNo).find(isOpenable) ?? null;
  }

  // Grades the teacher actually has lessons for, and the lessons in the chosen one.
  const availableGrades = Array.from(new Set(lessons.map((l) => l.grade))).sort(
    (a, b) => a - b
  );
  const gradeLessons =
    selectedGrade === null ? [] : lessons.filter((l) => l.grade === selectedGrade);

  // Picking a grade is a navigation: /teacher -> /teacher/grade-7.
  function chooseGrade(grade: number) {
    setOpenedLesson(null);
    setLastLesson(null);
    router.push(gradePath(grade));
  }

  // Enter ICT Fair mode: its own route, so Back returns to the grade.
  function openFairProjects() {
    setOpenedLesson(null);
    setFullscreenLesson(null);
    router.push(TEACHER_FAIR);
  }

  // Open a single project in the full-screen protected viewer.
  function openFairProject(project: FairProject) {
    setFairViewer(project);
  }

  // Bring the lesson viewer back after it was closed. If the lesson is still
  // available we restore it silently; otherwise we route through openLesson so
  // the teacher gets the proper explanation (completed / waiting / locked).
  function reopenLesson() {
    const target = openedLesson ?? lastLesson;
    if (!target) return;
    // Prefer the freshest copy - access status shifts as lessons complete.
    const fresh = lessons.find((l) => l.id === target.id) ?? target;
    if ((fresh.accessStatus ?? "available") !== "available") {
      openLesson(fresh);
      return;
    }
    setOpenedLesson(fresh);
  }

  // Drag the divider between the lesson viewer and the chat.
  function startPaneDrag(e: React.MouseEvent) {
    e.preventDefault();
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      const pct = (ev.clientX / window.innerWidth) * 100;
      setPaneWidth(Math.min(80, Math.max(35, pct)));
    }
    function onUp() {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Return to the clean starting screen (grade picker) with an empty session.
  function resetSession() {
    stopStreaming();
    clearChatSession();
    setFailedPrompt(null);
    setChatCollapsed(false);
    setMessages([]);
    setInput("");
    setThinking(false);
    setOpenedLesson(null);
    setViewedSlide(null);
    setLastLesson(null);
    setFullscreenLesson(null);
    refreshLessons();
    router.push(TEACHER_HOME);
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-full overflow-hidden",
        light
          ? "bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-100 text-slate-900"
          : "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100"
      )}
    >
      {/* Aurora background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={cn(
            "aurora-blob absolute -top-32 -left-24 h-96 w-96 rounded-full blur-3xl",
            light ? "bg-brand/15" : "bg-brand/30"
          )}
        />
        <div
          className={cn(
            "aurora-blob delay-1 absolute top-1/3 -right-32 h-96 w-96 rounded-full blur-3xl",
            light ? "bg-brand-700/15" : "bg-brand-700/20"
          )}
        />
        <div
          className={cn(
            "aurora-blob delay-2 absolute -bottom-32 left-1/3 h-96 w-96 rounded-full blur-3xl",
            light ? "bg-sky-300/20" : "bg-sky-500/20"
          )}
        />
        <div
          className={cn(
            "absolute inset-0",
            light
              ? "bg-[radial-gradient(circle_at_center,transparent_0%,rgba(241,245,249,0.5)_100%)]"
              : "bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,0.7)_100%)]"
          )}
        />
      </div>

      {/* Lesson viewer pane — shown to the left of the chat when a lesson is open */}
      {openedLesson && (
        <LessonPane
          lesson={openedLesson}
          width={chatCollapsed ? 100 : paneWidth}
          chatCollapsed={chatCollapsed}
          onToggleChat={() => setChatCollapsed((v) => !v)}
          current={openedSlide}
          onPrev={() => setOpenedSlide((s) => Math.max(1, s - 1))}
          onNext={() =>
            setOpenedSlide((s) => Math.min(openedLesson.slides.length, s + 1))
          }
          onClose={() => {
            setOpenedLesson(null);
            setViewedSlide(null);
            setChatCollapsed(false);
            refreshLessons();
          }}
          onFullscreen={() => setFullscreenLesson(openedLesson)}
          onCompleted={refreshLessons}
          onSlideChange={setViewedSlide}
          light={light}
        />
      )}

      {/* Drag handle between the lesson and the chat (desktop layout only) */}
      {openedLesson && !chatCollapsed && (
        <div
          onMouseDown={startPaneDrag}
          onDoubleClick={() => setPaneWidth(60)}
          title="Drag to resize · double-click to reset"
          role="separator"
          aria-orientation="vertical"
          className={cn(
            "relative z-20 hidden w-1.5 shrink-0 cursor-col-resize transition md:block",
            light ? "bg-slate-200/70 hover:bg-brand/50" : "bg-white/10 hover:bg-brand/50"
          )}
        />
      )}

      {/* Distraction-free full-screen PDF preview — no AI, no chat */}
      {fullscreenLesson?.fileId && (
        <FullscreenPdf
          lesson={fullscreenLesson}
          onClose={() => {
            setFullscreenLesson(null);
            refreshLessons();
          }}
          onCompleted={refreshLessons}
        />
      )}

      {/* ICT Fair project — full-screen, copy-protected, no progress tracking */}
      {fairViewer?.fileId && (
        <FairFullscreen project={fairViewer} onClose={() => setFairViewer(null)} />
      )}

      {/* Chat column — folded away while presenting full-width */}
      <div
        className={cn(
          "relative z-10 h-full min-h-0 min-w-0 flex-1 flex-col",
          openedLesson && chatCollapsed ? "hidden" : "flex"
        )}
      >
        {/* Header — relative z-30 lifts it (and its dropdown menus) above the
            chat messages below, which otherwise paint over the dropdowns. */}
        <div
          className={cn(
            "relative z-30 flex items-center gap-2 border-b px-3 py-4 backdrop-blur-xl sm:gap-3 sm:px-6",
            light ? "border-slate-200/60 bg-white/70" : "border-white/5 bg-slate-950/40"
          )}
        >
          <div className="relative shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700 p-[2px] shadow-lg shadow-brand/30">
            <img
              src="/logo.png"
              alt="IM-Telligence"
              className="h-9 w-9 rounded-full bg-white object-contain p-0.5"
            />
            <div
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-400",
                light ? "border-white" : "border-slate-900"
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-sm font-semibold tracking-tight",
                light ? "text-slate-900" : "text-white"
              )}
            >
              IM-Telligence AI
            </p>
            <p
              className={cn(
                "hidden items-center gap-1.5 truncate text-[11px] sm:flex",
                light ? "text-slate-500" : "text-slate-400"
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Online · Lesson copilot
            </p>
          </div>
          {(selectedGrade !== null || messages.length > 0 || showFairProjects) && (
            <button
              onClick={resetSession}
              title="Start a new session"
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium shadow-sm transition active:scale-95",
                light
                  ? "border-slate-200 bg-white text-slate-700 hover:border-brand/40 hover:text-brand-700"
                  : "border-white/10 bg-white/5 text-slate-200 hover:border-brand/40 hover:bg-white/10"
              )}
            >
              <Plus size={13} /> <span className="hidden sm:inline">New chat</span>
            </button>
          )}
          {session?.ictFairAccess && (
            <FairButton active={showFairProjects} onClick={openFairProjects} light={light} />
          )}
          <UserMenu session={session} light={light} />
        </div>

        {/* Required first step: pick a grade, then the chat / welcome */}
        <div
          ref={scrollRef}
          onScroll={onTranscriptScroll}
          className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"
        >
          {showFairProjects ? (
            <FairProjectsScreen
              projects={fairProjects}
              onOpen={openFairProject}
              light={light}
            />
          ) : selectedGrade === null ? (
            <GradeGate
              grades={availableGrades}
              loading={!lessonsLoaded}
              onPick={chooseGrade}
              light={light}
            />
          ) : isEmpty ? (
            <WelcomeScreen
              lessons={gradeLessons}
              grade={selectedGrade}
              progressByLesson={progressByLesson}
              onOpenLesson={openLesson}
              onRequestAccess={requestAccess}
              onPrompt={(text) => send(text)}
              requestedLessonIds={requestedLessonIds}
              light={light}
            />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} light={light} />
              ))}
              {failedPrompt && !thinking && !streaming && (
                <div className="flex justify-center">
                  <button
                    onClick={retryLast}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition",
                      light
                        ? "border-slate-200 bg-white text-slate-700 hover:border-brand/40 hover:text-brand-700"
                        : "border-white/10 bg-white/5 text-slate-200 hover:border-brand/40"
                    )}
                  >
                    <RotateCcw size={12} /> Try that question again
                  </button>
                </div>
              )}
              {thinking && <TypingIndicator light={light} />}
            </div>
          )}
        </div>

        {/* Reading back through the transcript while a reply streams in */}
        {!atBottom && messages.length > 0 && (
          <div className="pointer-events-none relative z-20">
            <button
              onClick={jumpToLatest}
              className={cn(
                "pointer-events-auto absolute -top-12 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium shadow-lg transition",
                light
                  ? "border-slate-200 bg-white text-slate-700 hover:text-brand-700"
                  : "border-white/10 bg-slate-900 text-slate-200"
              )}
            >
              <ArrowDown size={12} /> Jump to latest
            </button>
          </div>
        )}

        {/* Composer — hidden on the grade gate (the assistant isn't usable
            until a grade is picked) and in ICT Fair mode (view-only, no chat) */}
        {!showFairProjects && selectedGrade !== null && (
        <div
          className={cn(
            "border-t px-4 py-4 backdrop-blur-xl sm:px-8",
            light
              ? "border-slate-200/60 bg-white/40"
              : "border-white/5 bg-slate-950/40"
          )}
        >
          <div className="mx-auto max-w-3xl">
            <div
              className={cn(
                "group relative flex items-end gap-2 rounded-2xl border p-2 shadow-lg transition focus-within:border-brand/60",
                light
                  ? "border-slate-200 bg-white shadow-slate-900/5 focus-within:shadow-brand/20"
                  : "border-white/10 bg-white/5 shadow-black/30 focus-within:shadow-brand/20"
              )}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Message IM-Telligence AI…"
                className={cn(
                  "max-h-[180px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm focus:outline-none disabled:cursor-not-allowed",
                  light
                    ? "text-slate-900 placeholder:text-slate-400"
                    : "text-white placeholder:text-slate-500"
                )}
              />
              {thinking || streaming ? (
                <button
                  onClick={stopStreaming}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-700"
                  aria-label="Stop the reply"
                  title="Stop"
                >
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!input.trim()}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition",
                    input.trim()
                      ? "bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/40 hover:brightness-110"
                      : light
                      ? "bg-slate-100 text-slate-400"
                      : "bg-white/5 text-slate-500"
                  )}
                  aria-label="Send"
                >
                  <ArrowUp size={16} />
                </button>
              )}
            </div>
            <p
              className={cn(
                "mt-2 text-center text-[11px]",
                light ? "text-slate-500" : "text-slate-500"
              )}
            >
              Press{" "}
              <kbd
                className={cn(
                  "rounded px-1 py-0.5",
                  light ? "bg-slate-200/60" : "bg-white/5"
                )}
              >
                Enter
              </kbd>{" "}
              to send ·{" "}
              <kbd
                className={cn(
                  "rounded px-1 py-0.5",
                  light ? "bg-slate-200/60" : "bg-white/5"
                )}
              >
                Shift+Enter
              </kbd>{" "}
              for newline
            </p>
          </div>
        </div>
        )}
      </div>

      {/* Lesson rail — quick actions for the lesson in play. Hidden on the
          grade gate (there is no lesson yet) and while the viewer pane is open
          (the viewer already offers these) so the PDF and chat get the full
          width. */}
      <aside
        className={cn(
          "relative z-10 hidden w-80 shrink-0 flex-col border-l backdrop-blur-xl",
          light ? "border-slate-200/60 bg-white/40" : "border-white/5 bg-slate-950/40",
          openedLesson || showFairProjects || selectedGrade === null
            ? ""
            : "xl:flex"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b px-5 py-4",
            light ? "border-slate-200/60" : "border-white/5"
          )}
        >
          <Presentation size={14} className={light ? "text-slate-500" : "text-slate-400"} />
          <p className={cn("text-sm font-semibold", light ? "text-slate-900" : "text-white")}>
            Your lesson
          </p>
        </div>

        <div className="chat-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {panelLesson ? (
            <div
              className={cn(
                "rounded-xl border p-3",
                light ? "border-slate-200 bg-white/70" : "border-white/5 bg-white/5"
              )}
            >
              <p
                className={cn(
                  "text-sm font-medium leading-snug",
                  light ? "text-slate-900" : "text-white"
                )}
              >
                {panelLesson.title}
              </p>
              <p className={cn("mt-0.5 text-[11px]", light ? "text-slate-500" : "text-slate-400")}>
                Grade {panelLesson.grade}
                {panelLesson.course ? ` · ${courseLabel(panelLesson.course)}` : ""}
                {viewedSlide ? ` · slide ${viewedSlide}` : ""}
              </p>

              <div className="mt-3 space-y-1.5">
                <button
                  onClick={reopenLesson}
                  className="flex w-full items-center gap-2 rounded-lg bg-gradient-to-br from-brand to-brand-700 px-3 py-2 text-xs font-medium text-white shadow-lg shadow-brand/30 transition hover:brightness-110"
                >
                  <Presentation size={13} /> Reopen lesson
                </button>
                <button
                  onClick={() => setFullscreenLesson(panelLesson)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition",
                    light
                      ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  )}
                >
                  <Maximize2 size={13} /> Full screen
                </button>
                {(panelLesson.accessStatus ?? "available") === "completed" && (
                  <p
                    className={cn(
                      "flex items-center gap-1.5 px-1 pt-1 text-[11px]",
                      light ? "text-emerald-600" : "text-emerald-400"
                    )}
                  >
                    <CheckCircle2 size={12} /> Completed
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className={cn("px-1 text-xs", light ? "text-slate-500" : "text-slate-500")}>
              Open a lesson and it will appear here, so you can bring it back at
              any time.
            </p>
          )}

          {/* Jump straight to any other lesson without leaving the chat. */}
          {gradeLessons.length > 0 && (
            <div>
              <p
                className={cn(
                  "mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider",
                  light ? "text-slate-400" : "text-slate-500"
                )}
              >
                All lessons
              </p>
              <div className="space-y-1">
                {[...gradeLessons].sort(byLessonNo).map((l) => {
                  const status = l.accessStatus ?? "available";
                  const isOpen = panelLesson?.id === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => openLesson(l)}
                      title={l.title}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] transition",
                        isOpen
                          ? "border-brand/40 bg-brand-50/60"
                          : light
                          ? "border-transparent hover:border-slate-200 hover:bg-white/70"
                          : "border-transparent hover:border-white/10 hover:bg-white/5"
                      )}
                    >
                      {status === "completed" ? (
                        <CheckCircle2 size={12} className="shrink-0 text-emerald-500" />
                      ) : status === "waiting" ? (
                        <Clock size={12} className="shrink-0 text-amber-500" />
                      ) : status === "locked" ? (
                        <Lock size={12} className="shrink-0 text-slate-400" />
                      ) : (
                        <Presentation size={12} className="shrink-0 text-brand-600" />
                      )}
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          light ? "text-slate-700" : "text-slate-200",
                          status !== "available" && "opacity-70"
                        )}
                      >
                        {l.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// Required first step — the teacher must choose which grade they're teaching
// before the assistant is usable. Lessons + answers are scoped to it.
function GradeGate({
  grades,
  loading,
  onPick,
  light,
}: {
  grades: number[];
  loading: boolean;
  onPick: (grade: number) => void;
  light: boolean;
}) {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 via-brand to-brand-800 shadow-xl shadow-brand/40">
        <GraduationCap size={28} className="text-white" />
      </div>
      <h1
        className={cn(
          "bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl",
          light
            ? "bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500"
            : "bg-gradient-to-r from-white via-slate-200 to-slate-400"
        )}
      >
        What grade are we teaching?
      </h1>
      <p className={cn("mt-3 text-sm", light ? "text-slate-600" : "text-slate-400")}>
        Pick the grade for this session — your lessons and the assistant will be
        scoped to it.
      </p>

      {loading ? (
        <div
          className={cn(
            "mt-8 flex items-center gap-2 text-sm",
            light ? "text-slate-500" : "text-slate-400"
          )}
        >
          <Loader2 size={16} className="animate-spin" /> Loading your grades…
        </div>
      ) : grades.length === 0 ? (
        <p className={cn("mt-8 text-sm", light ? "text-slate-500" : "text-slate-400")}>
          You have no assigned lessons yet. Ask your administrator to assign you a
          lesson.
        </p>
      ) : (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {grades.map((g) => (
            <button
              key={g}
              onClick={() => onPick(g)}
              className={cn(
                "flex min-w-[110px] flex-col items-center gap-1 rounded-2xl border px-5 py-4 transition hover:border-brand/50",
                light
                  ? "border-slate-200 bg-white/70 hover:bg-white"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              )}
            >
              <span
                className={cn(
                  "text-[11px] uppercase tracking-wider",
                  light ? "text-slate-400" : "text-slate-500"
                )}
              >
                Grade
              </span>
              <span
                className={cn(
                  "text-2xl font-semibold",
                  light ? "text-slate-900" : "text-white"
                )}
              >
                {g}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WelcomeScreen({
  lessons,
  grade,
  progressByLesson,
  onOpenLesson,
  onRequestAccess,
  onPrompt,
  requestedLessonIds,
  light,
}: {
  lessons: Lesson[];
  grade: number;
  progressByLesson: Record<string, ProgressEntry>;
  onOpenLesson: (lesson: Lesson) => void;
  onRequestAccess: (lesson: Lesson) => void;
  onPrompt: (text: string) => void;
  requestedLessonIds: Set<string>;
  light: boolean;
}) {
  const [showCompleted, setShowCompleted] = useState(false);

  const ordered = [...lessons].sort(byLessonNo);
  // Sequential unlocking means exactly one lesson is normally open — that one
  // is the whole point of this screen, so it gets the hero treatment.
  const current = ordered.find((l) => (l.accessStatus ?? "available") === "available");
  const completed = ordered.filter((l) => l.accessStatus === "completed");
  const upcoming = ordered.filter(
    (l) => l.accessStatus !== "completed" && l.id !== current?.id
  );
  const currentProgress = current ? progressByLesson[current.id] : undefined;
  const percent = currentProgress?.percentComplete ?? 0;
  // Teachers navigate by slide, so say which one they stopped on. Rows saved
  // before slide positions were recorded only have the percentage.
  const position =
    currentProgress?.lastSlide && currentProgress.slideTotal
      ? `Slide ${currentProgress.lastSlide} of ${currentProgress.slideTotal}`
      : percent > 0
      ? `${percent}% read`
      : null;

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center py-6 text-center sm:py-10">
      <img
        src="/logo.png"
        alt="IM-Telligence"
        className="mb-6 h-16 w-16 rounded-2xl bg-white object-contain p-1.5 shadow-xl shadow-brand/40"
      />
      <h1
        className={cn(
          "bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl",
          light
            ? "bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500"
            : "bg-gradient-to-r from-white via-slate-200 to-slate-400"
        )}
      >
        How can I help you teach today?
      </h1>
      <p className={cn("mt-3 text-sm", light ? "text-slate-600" : "text-slate-400")}>
        Teaching <span className="font-medium">Grade {grade}</span>. Open your
        lesson to present it, or ask me a question.
      </p>

      {lessons.length === 0 && (
        <p className={cn("mt-6 text-sm", light ? "text-slate-500" : "text-slate-400")}>
          No lessons assigned for Grade {grade} yet.
        </p>
      )}

      {/* The lesson they're on — one obvious thing to click. */}
      {current && (
        <button
          onClick={() => onOpenLesson(current)}
          className="mt-8 w-full rounded-2xl border border-brand/30 bg-white p-5 text-left shadow-lg shadow-brand/10 transition hover:border-brand/60 hover:shadow-brand/20"
        >
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/30">
              <Presentation size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-brand-600">
                {percent > 0 ? "Continue where you left off" : "Your current lesson"}
                {current.course ? ` · ${courseLabel(current.course)}` : ""}
              </p>
              <p className="mt-0.5 truncate text-base font-semibold text-slate-900">
                {current.title}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-br from-brand to-brand-700 px-3.5 py-2 text-xs font-medium text-white shadow-lg shadow-brand/30">
              {percent > 0 ? "Continue" : "Open lesson"}
              <ChevronRight size={13} />
            </span>
          </div>
          {percent > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-brand" style={{ width: `${percent}%` }} />
              </div>
              <span className="shrink-0 text-right text-[11px] tabular-nums text-slate-500">
                {position}
              </span>
            </div>
          )}
        </button>
      )}

      {/* Openers, so the assistant isn't a blank box. */}
      {lessons.length > 0 && (
        <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPrompt(prompt)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] transition",
                light
                  ? "border-slate-200 bg-white/70 text-slate-600 hover:border-brand/40 hover:text-brand-700"
                  : "border-white/10 bg-white/5 text-slate-300 hover:border-brand/40"
              )}
            >
              <Sparkles size={12} className="text-brand-600" /> {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Everything still ahead of them — locked or waiting out its period. */}
      {upcoming.length > 0 && (
        <div className="mt-8 w-full space-y-6 text-left">
          {groupLessonsByCourse(upcoming).map(({ course, items }) => (
            <div key={course ?? "default"}>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                {courseLabel(course)}
              </p>
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((l) => (
                  <LessonChip
                    key={l.id}
                    lesson={l}
                    onOpen={onOpenLesson}
                    onRequestAccess={onRequestAccess}
                    requested={requestedLessonIds.has(l.id)}
                    light={light}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Finished lessons are history — folded away until asked for. */}
      {completed.length > 0 && (
        <div className="mt-6 w-full text-left">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-medium transition",
              light ? "text-slate-500 hover:text-slate-800" : "text-slate-400 hover:text-white"
            )}
          >
            <CheckCircle2 size={12} className="text-emerald-500" />
            {showCompleted ? "Hide" : "Show"} {completed.length} completed lesson
            {completed.length === 1 ? "" : "s"}
            <ChevronDown
              size={12}
              className={cn("transition", showCompleted && "rotate-180")}
            />
          </button>
          {showCompleted && (
            <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {completed.map((l) => (
                <LessonChip
                  key={l.id}
                  lesson={l}
                  onOpen={onOpenLesson}
                  onRequestAccess={onRequestAccess}
                  requested={requestedLessonIds.has(l.id)}
                  light={light}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FairProjectsScreen({
  projects,
  onOpen,
  light,
}: {
  projects: FairProject[];
  onOpen: (project: FairProject) => void;
  light: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center py-6 text-center sm:py-10">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 via-brand to-brand-800 shadow-xl shadow-brand/40">
        <Presentation size={28} className="text-white" />
      </div>
      <h1
        className={cn(
          "bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl",
          light
            ? "bg-gradient-to-r from-slate-900 via-slate-700 to-slate-500"
            : "bg-gradient-to-r from-white via-slate-200 to-slate-400"
        )}
      >
        ICT Fair projects
      </h1>
      <p className={cn("mt-3 text-sm", light ? "text-slate-600" : "text-slate-400")}>
        Open a shared ICT Fair project to present it in the protected viewer.
      </p>

      {projects.length === 0 ? (
        <p className={cn("mt-8 text-sm", light ? "text-slate-500" : "text-slate-400")}>
          No ICT Fair projects shared yet.
        </p>
      ) : (
        <div className="mt-8 grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => project.fileId && onOpen(project)}
              disabled={!project.fileId}
              className={cn(
                "group flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition",
                project.fileId
                  ? "border-slate-200 bg-white/70 hover:border-brand/40 hover:bg-white"
                  : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  project.fileId
                    ? "bg-slate-100 text-brand-600 group-hover:bg-brand/20"
                    : "bg-slate-100 text-slate-400"
                )}
              >
                <Presentation size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{project.title}</span>
                <span className="text-[11px] text-slate-400">
                  {project.fileId ? "PDF project" : "Missing file"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// A lesson tile in the welcome list. Reflects the sequential-unlock state:
// available lessons open normally; completed/waiting/locked ones show why and,
// when clicked, surface a "ask your admin" message in the chat.
function LessonChip({
  lesson,
  onOpen,
  onRequestAccess,
  requested,
  light,
}: {
  lesson: Lesson;
  onOpen: (lesson: Lesson) => void;
  onRequestAccess: (lesson: Lesson) => void;
  requested: boolean;
  light: boolean;
}) {
  const status = lesson.accessStatus ?? "available";
  const locked = status !== "available";

  const meta = {
    available: { Icon: Presentation, label: lesson.fileId ? "PDF" : "Slides", tone: "" },
    completed: { Icon: CheckCircle2, label: "Completed", tone: "text-emerald-600" },
    waiting: {
      Icon: Clock,
      label: `Unlocks ${formatUnlockDate(lesson.availableAt)}`,
      tone: "text-amber-600",
    },
    locked: { Icon: Lock, label: "Locked", tone: "text-slate-400" },
  }[status];
  const Icon = meta.Icon;

  const body = (
    <>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          locked
            ? "bg-slate-100 text-slate-400"
            : "bg-slate-100 text-brand-600 group-hover:bg-brand/20"
        )}
      >
        <Icon size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-medium", locked && "text-slate-500")}>
          {lesson.title}
        </span>
        <span className={cn("text-[11px]", meta.tone || "text-slate-400")}>{meta.label}</span>
      </span>
    </>
  );

  // Available lessons open on click.
  if (!locked) {
    return (
      <button
        onClick={() => onOpen(lesson)}
        className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm transition hover:border-brand/40 hover:bg-white"
      >
        {body}
      </button>
    );
  }

  // Locked lessons explain themselves in the chat when clicked (same as the
  // lesson rail), and offer a "Request access" action that pings the
  // super-admin to unlock it.
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <button
        onClick={() => onOpen(lesson)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        title={`Why is "${lesson.title}" not available?`}
      >
        {body}
      </button>
      {status === "completed" ? null : requested ? (
        <span className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
          <CheckCircle2 size={12} /> Requested
        </span>
      ) : (
        <button
          onClick={() => onRequestAccess(lesson)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-brand/30 bg-brand-50 px-2.5 py-1.5 text-[11px] font-medium text-brand-700 transition hover:bg-brand-100"
        >
          <BellRing size={12} /> Request access
        </button>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  light,
}: {
  message: AIMessage;
  light: boolean;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(stripMarkdown(message.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — nothing useful to say about it */
    }
  }

  return (
    <div className={cn("msg-in group flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? light
              ? "bg-slate-200 text-slate-700"
              : "bg-white/10 text-slate-300"
            : "bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/30"
        )}
      >
        {isUser ? <UserIcon size={14} /> : <Bot size={14} />}
      </div>
      <div className={cn("flex max-w-[80%] flex-col gap-1.5", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/20"
              : light
              ? "border border-slate-200 bg-white/80 text-slate-900 backdrop-blur"
              : "border border-white/10 bg-white/5 text-slate-100 backdrop-blur"
          )}
        >
          <p className="whitespace-pre-wrap break-words">
            {stripMarkdown(message.content)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-1">
            {!isUser && (
              <button
                onClick={copy}
                title="Copy this answer"
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] opacity-0 transition group-hover:opacity-100 focus:opacity-100",
                  light
                    ? "border-slate-200 bg-white/70 text-slate-600 hover:text-slate-900"
                    : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                )}
              >
                {copied ? <Check size={10} /> : <Copy size={10} />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            {message.sourceRef && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px]",
                  light
                    ? "border-slate-200 bg-white/70 text-slate-600"
                    : "border-white/10 bg-white/5 text-slate-400"
                )}
              >
                {message.sourceRef}
              </span>
            )}
            {message.cached && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px]",
                  light
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                )}
              >
                Fast response
              </span>
            )}
        </div>
      </div>
    </div>
  );
}

function FairButton({
  active,
  onClick,
  light,
}: {
  active: boolean;
  onClick: () => void;
  light: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title="ICT Fair projects"
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-medium shadow-sm transition active:scale-95",
        active
          ? "border-slate-900 bg-white text-slate-900"
          : light
          ? "border-slate-200 bg-white text-slate-700 hover:border-brand/40 hover:text-brand-700"
          : "border-white/10 bg-white/5 text-slate-200 hover:border-brand/40 hover:bg-white/10"
      )}
    >
      <Presentation size={13} /> <span className="hidden sm:inline">ICT Fair</span>
    </button>
  );
}

function UserMenu({
  session,
  light,
}: {
  session: Session | null;
  light: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!session) {
    return (
      <button
        onClick={() => router.push("/")}
        className={cn(
          "rounded-full border px-3 py-1.5 text-[11px]",
          light
            ? "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
            : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
        )}
      >
        Sign in
      </button>
    );
  }

  async function handleSignOut() {
    clearChatSession();
    await logout();
    router.push("/");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-left transition",
          light
            ? "border-slate-200 bg-white/70 hover:bg-white"
            : "border-white/10 bg-white/5 hover:bg-white/10"
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-700 text-[11px] font-semibold text-white shadow-lg shadow-brand/30">
          {initials(session.name)}
        </span>
        <span className="hidden flex-col leading-tight md:flex">
          <span
            className={cn(
              "text-[12px] font-medium",
              light ? "text-slate-900" : "text-white"
            )}
          >
            {session.name}
          </span>
          <span
            className={cn(
              "text-[10px] capitalize",
              light ? "text-slate-500" : "text-slate-400"
            )}
          >
            {session.role.replace("-", " ")}
          </span>
        </span>
        <ChevronDown
          size={12}
          className={cn(
            "transition",
            light ? "text-slate-500" : "text-slate-400",
            open && (light ? "rotate-180 text-slate-900" : "rotate-180 text-white")
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border shadow-2xl",
            light
              ? "border-slate-200 bg-white"
              : "border-white/10 bg-slate-900"
          )}
        >
          <div
            className={cn(
              "flex items-center gap-3 border-b px-4 py-3",
              light ? "border-slate-200" : "border-white/5"
            )}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-700 text-sm font-semibold text-white shadow-lg shadow-brand/30">
              {initials(session.name)}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  light ? "text-slate-900" : "text-white"
                )}
              >
                {session.name}
              </p>
              <p
                className={cn(
                  "truncate text-[11px]",
                  light ? "text-slate-500" : "text-slate-400"
                )}
              >
                {session.email}
              </p>
            </div>
          </div>
          <div className="p-1.5">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/teacher/progress");
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                light
                  ? "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  : "text-slate-200 hover:bg-white/5 hover:text-white"
              )}
            >
              <TrendingUp
                size={14}
                className={light ? "text-slate-500" : "text-slate-400"}
              />
              Your progress
            </button>
            <button
              onClick={handleSignOut}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                light
                  ? "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  : "text-slate-200 hover:bg-white/5 hover:text-white"
              )}
            >
              <LogOut
                size={14}
                className={light ? "text-slate-500" : "text-slate-400"}
              />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TypingIndicator({ light }: { light: boolean }) {
  return (
    <div className="msg-in flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/30">
        <Bot size={14} />
      </div>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-2xl border px-4 py-3 backdrop-blur",
          light ? "border-slate-200 bg-white/80" : "border-white/10 bg-white/5"
        )}
      >
        <span
          className={cn(
            "typing-dot h-1.5 w-1.5 rounded-full",
            light ? "bg-slate-500" : "bg-slate-400"
          )}
        />
        <span
          className={cn(
            "typing-dot h-1.5 w-1.5 rounded-full",
            light ? "bg-slate-500" : "bg-slate-400"
          )}
        />
        <span
          className={cn(
            "typing-dot h-1.5 w-1.5 rounded-full",
            light ? "bg-slate-500" : "bg-slate-400"
          )}
        />
      </div>
    </div>
  );
}

function LessonPane({
  lesson,
  width,
  chatCollapsed,
  onToggleChat,
  current,
  onPrev,
  onNext,
  onClose,
  onFullscreen,
  onCompleted,
  onSlideChange,
  light,
}: {
  lesson: Lesson;
  width: number;
  chatCollapsed: boolean;
  onToggleChat: () => void;
  current: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onFullscreen: () => void;
  onCompleted?: () => void;
  onSlideChange?: (slide: number) => void;
  light: boolean;
}) {
  const isPdf = Boolean(lesson.fileId);
  const total = lesson.slides.length;
  const slide = isPdf ? undefined : lesson.slides[current - 1];

  return (
    <div
      style={{ width: `${width}%` }}
      className={cn(
        "relative z-10 hidden h-full shrink-0 flex-col border-r backdrop-blur-xl md:flex",
        light
          ? "border-slate-200/60 bg-white/40"
          : "border-white/5 bg-slate-950/40"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-3 border-b px-5 py-4",
          light ? "border-slate-200/60" : "border-white/5"
        )}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-brand shadow-lg shadow-sky-500/20">
          <Presentation size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              light ? "text-slate-900" : "text-white"
            )}
          >
            {lesson.title}
          </p>
          <p
            className={cn(
              "text-[11px]",
              light ? "text-slate-500" : "text-slate-400"
            )}
          >
            Grade {lesson.grade} · {isPdf ? "PDF lesson" : `${total} slides`}
          </p>
        </div>
        {!isPdf && (
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[11px]",
              light
                ? "border-slate-200 bg-white/70 text-slate-700"
                : "border-white/10 bg-white/5 text-slate-300"
            )}
          >
            {current} / {total}
          </span>
        )}
        {isPdf && (
          <button
            onClick={onFullscreen}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition",
              light
                ? "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
            )}
            aria-label="Open full-screen preview"
          >
            <Maximize2 size={13} /> Full screen
          </button>
        )}
        <button
          onClick={onToggleChat}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition",
            light
              ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          )}
          aria-label={chatCollapsed ? "Show the assistant" : "Hide the assistant"}
          title={chatCollapsed ? "Show the assistant" : "Hide the assistant"}
        >
          {chatCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
        </button>
        <button
          onClick={onClose}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg transition",
            light
              ? "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          )}
          aria-label="Close presentation"
        >
          <X size={16} />
        </button>
      </div>

      {/* Canvas: real PDF when linked, otherwise the slide deck */}
      {isPdf ? (
        <div className="min-h-0 flex-1">
          <PdfCanvasViewer
            fileId={lesson.fileId as string}
            lessonId={lesson.id}
            light={light}
            accessStatus={lesson.accessStatus}
            onExit={onClose}
            onCompleted={onCompleted}
            onSlideChange={onSlideChange}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4 px-8 py-6 min-h-0">
          <div className="flex flex-1 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white via-slate-50 to-slate-100 text-slate-900 shadow-2xl min-h-0">
            {slide?.imageUrl ? (
              <img
                src={slide.imageUrl}
                alt={slide.title}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full flex-col p-10">
                <p className="text-xs font-medium uppercase tracking-widest text-brand-600">
                  Slide {slide?.index} of {total}
                </p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-slate-900 lg:text-4xl xl:text-5xl">
                  {slide?.title}
                </h2>
                <p className="mt-5 text-base leading-relaxed text-slate-600 lg:text-lg">
                  {slide?.body}
                </p>
                <div className="mt-auto flex min-h-[40%] flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-gradient-to-br from-brand-50 to-slate-100 text-sm text-slate-400">
                  Slide visual
                </div>
              </div>
            )}
          </div>

          {/* Slide rail */}
          <div className="flex flex-wrap gap-1.5">
            {lesson.slides.map((s) => (
              <span
                key={s.id}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition",
                  s.index === current
                    ? "bg-gradient-to-r from-brand to-brand-700"
                    : s.index < current
                    ? light
                      ? "bg-slate-300"
                      : "bg-white/30"
                    : light
                    ? "bg-slate-200"
                    : "bg-white/10"
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Controls — slide navigation only applies to deck lessons */}
      {isPdf ? (
        <div
          className={cn(
            "flex items-center justify-center border-t px-5 py-3 text-[11px]",
            light ? "border-slate-200/60 text-slate-500" : "border-white/5 text-slate-500"
          )}
        >
          {chatCollapsed
            ? "Presenting full width · reopen the assistant from the header"
            : "Scroll the PDF on the left · ask the AI on the right about it"}
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center justify-between border-t px-5 py-3",
            light ? "border-slate-200/60" : "border-white/5"
          )}
        >
          <button
            onClick={onPrev}
            disabled={current === 1}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition",
              light ? "border-slate-200" : "border-white/10",
              current === 1
                ? light
                  ? "cursor-not-allowed text-slate-400"
                  : "cursor-not-allowed text-slate-600"
                : light
                ? "text-slate-700 hover:bg-slate-100"
                : "text-slate-200 hover:bg-white/5"
            )}
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <p className={cn("text-[11px]", light ? "text-slate-500" : "text-slate-500")}>
            Ask the AI on the right to explain any slide
          </p>
          <button
            onClick={onNext}
            disabled={current === total}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition",
              current === total
                ? light
                  ? "cursor-not-allowed border border-slate-200 text-slate-400"
                  : "cursor-not-allowed border border-white/10 text-slate-600"
                : "bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/30 hover:brightness-110"
            )}
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Distraction-free full-screen PDF preview. Covers the whole screen with just
// the lesson PDF (same protected canvas viewer) and a close button — no AI,
// no chat, no slide controls. Esc closes it.
function FullscreenPdf({
  lesson,
  onClose,
  onCompleted,
}: {
  lesson: Lesson;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <img
          src="/logo.png"
          alt="IM-Telligence"
          className="h-8 w-8 rounded-full bg-white object-contain p-0.5 shadow"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{lesson.title}</p>
          <p className="text-[11px] text-slate-500">
            Grade {lesson.grade} · Full-screen preview
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100"
          aria-label="Exit full-screen preview"
        >
          <Minimize2 size={13} /> Exit full screen
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <PdfCanvasViewer
          fileId={lesson.fileId as string}
          lessonId={lesson.id}
          light
          accessStatus={lesson.accessStatus}
          onExit={onClose}
          onCompleted={onCompleted}
        />
      </div>
    </div>
  );
}

// Full-screen viewer for an ICT Fair project — same copy protection as lessons,
// but no lessonId so there's no progress tracking or completion.
function FairFullscreen({
  project,
  onClose,
}: {
  project: FairProject;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-100">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow">
          <Presentation size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{project.title}</p>
          <p className="text-[11px] text-slate-500">ICT Fair · Full-screen preview</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100"
          aria-label="Exit full-screen preview"
        >
          <Minimize2 size={13} /> Exit full screen
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <PdfCanvasViewer fileId={project.fileId as string} light onExit={onClose} />
      </div>
    </div>
  );
}
