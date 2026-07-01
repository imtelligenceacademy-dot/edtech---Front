"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Plus,
  FileText,
  CheckCircle2,
  HelpCircle,
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
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import {
  getSession,
  logout,
  listLessons,
  listMyAccessRequests,
  requestLessonAccess,
  saveLessonProgress,
  streamTeacherAI,
} from "@/lib/api";
import { PdfCanvasViewer } from "@/components/lesson-viewer/PdfCanvasViewer";
import type { AIMessage, Lesson, Session } from "@/types";

type ReportEntry = {
  id: string;
  kind: "lesson" | "question";
  summary: string;
  at: string;
};


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
const NEXT_LESSON_INTENT = /\bnext (?:lesson|one)\b|\b(?:open|start|go to|load)\b[^.?!]*\bnext\b/i;
// "open my lesson" / "reopen this lesson" -> open the current/available lesson.
const OPEN_LESSON_INTENT = /\breopen\b|\b(?:open|start|resume|continue|load|go to)\b[^.?!]*\blesson\b/i;

// Order lessons by their curriculum number for sequential navigation.
function byLessonNo(a: Lesson, b: Lesson): number {
  return (a.lessonNo ?? 0) - (b.lessonNo ?? 0);
}

export function Chatbot() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [report, setReport] = useState<ReportEntry[]>([]);
  const [openedLesson, setOpenedLesson] = useState<Lesson | null>(null);
  const [openedSlide, setOpenedSlide] = useState(1);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoaded, setLessonsLoaded] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // The teacher experience is light-only.
  const light = true;
  const [fullscreenLesson, setFullscreenLesson] = useState<Lesson | null>(null);
  // Lesson ids with a pending access request to the super-admin.
  const [requestedLessonIds, setRequestedLessonIds] = useState<Set<string>>(
    () => new Set()
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getSession().then(setSession).catch(() => setSession(null));
    // Load the teacher's real assigned lessons (with their linked PDFs).
    listLessons()
      .then(setLessons)
      .catch(() => setLessons([]))
      .finally(() => setLessonsLoaded(true));
    // Track which locked lessons the teacher has already asked to unlock.
    listMyAccessRequests()
      .then((reqs) =>
        setRequestedLessonIds(
          new Set(reqs.filter((r) => r.status === "pending").map((r) => r.lessonId))
        )
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

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

  function logReport(entry: Omit<ReportEntry, "id" | "at">) {
    setReport((prev) => [
      ...prev,
      { ...entry, id: `r_${Date.now()}`, at: new Date().toISOString() },
    ]);
  }

  async function answerQuestion(text: string) {
    // Prior turns become the conversation history; the backend appends `text`.
    const history = messages
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    const assistantId = `a_${Date.now()}`;
    let started = false;
    let sourceRef: string | undefined;

    try {
      await streamTeacherAI(
        { message: text, lessonId: openedLesson?.id ?? null, history },
        {
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
      }
    } catch {
      pushAssistant(
        "I couldn't reach the assistant just now. Please try again in a moment."
      );
    } finally {
      setThinking(false);
    }
    logReport({
      kind: "question",
      summary: `Q&A — "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`,
    });
  }

  // Re-pull lesson access state (statuses shift after a completion/unlock).
  function refreshLessons() {
    listLessons().then(setLessons).catch(() => {});
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
      logReport({
        kind: "lesson",
        summary: `Blocked — "${lesson.title}" is ${lesson.accessStatus}.`,
      });
      return;
    }
    setOpenedLesson(lesson);
    setOpenedSlide(1);
    const detail = lesson.fileId
      ? "The lesson PDF is open on the left — ask me anything about it here."
      : `${lesson.slides.length} slides. The deck is open on the left; ask me anything about a slide and I'll explain it here.`;
    pushAssistant(`Opening "${lesson.title}" — Grade ${lesson.grade}. ${detail}`, {
      sourceRef: lesson.title,
    });
    logReport({
      kind: "lesson",
      summary: `Opened lesson "${lesson.title}" (Grade ${lesson.grade}).`,
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
      logReport({ kind: "lesson", summary: `Marked "${lesson.title}" complete.` });
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
    const named = findLessonByText(text, gradeLessons);
    if (named) {
      openLesson(named);
      return;
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

  // Grades the teacher actually has lessons for, and the lessons in the chosen one.
  const availableGrades = Array.from(new Set(lessons.map((l) => l.grade))).sort(
    (a, b) => a - b
  );
  const gradeLessons =
    selectedGrade === null ? [] : lessons.filter((l) => l.grade === selectedGrade);

  function chooseGrade(grade: number) {
    setSelectedGrade(grade);
    setOpenedLesson(null);
  }

  // Return to the clean starting screen (grade picker) with an empty session.
  function resetSession() {
    setMessages([]);
    setReport([]);
    setInput("");
    setThinking(false);
    setOpenedLesson(null);
    setFullscreenLesson(null);
    setSelectedGrade(null);
    refreshLessons();
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
          current={openedSlide}
          onPrev={() => setOpenedSlide((s) => Math.max(1, s - 1))}
          onNext={() =>
            setOpenedSlide((s) => Math.min(openedLesson.slides.length, s + 1))
          }
          onClose={() => {
            setOpenedLesson(null);
            refreshLessons();
          }}
          onFullscreen={() => setFullscreenLesson(openedLesson)}
          onCompleted={refreshLessons}
          light={light}
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

      {/* Chat column */}
      <div className="relative z-10 flex h-full min-w-0 flex-1 flex-col">
        {/* Header — relative z-30 lifts it (and its dropdown menus) above the
            chat messages below, which otherwise paint over the dropdowns. */}
        <div
          className={cn(
            "relative z-30 flex items-center gap-2 border-b px-3 py-4 backdrop-blur-xl sm:gap-3 sm:px-6",
            light ? "border-slate-200/60 bg-white/70" : "border-white/5 bg-slate-950/40"
          )}
        >
          <div className="relative">
            <img
              src="/logo.png"
              alt="IM-Telligence"
              className="h-9 w-9 rounded-full bg-white object-contain p-0.5 shadow-lg shadow-brand/30"
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
                "truncate text-sm font-semibold",
                light ? "text-slate-900" : "text-white"
              )}
            >
              IM-Telligence AI
            </p>
            <p
              className={cn(
                "hidden truncate text-[11px] lg:block",
                light ? "text-slate-500" : "text-slate-400"
              )}
            >
              Lesson copilot · opens lessons and answers questions
            </p>
          </div>
          {(selectedGrade !== null || messages.length > 0) && (
            <button
              onClick={resetSession}
              title="Start a new session"
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition",
                light
                  ? "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                  : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
              )}
            >
              <Plus size={13} /> <span className="hidden sm:inline">New chat</span>
            </button>
          )}
          {selectedGrade !== null && (
            <GradeMenu
              grade={selectedGrade}
              grades={availableGrades}
              onChange={chooseGrade}
              light={light}
            />
          )}
          <UserMenu session={session} light={light} />
        </div>

        {/* Required first step: pick a grade, then the chat / welcome */}
        <div
          ref={scrollRef}
          className="chat-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-8"
        >
          {selectedGrade === null ? (
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
              onOpenLesson={openLesson}
              onRequestAccess={requestAccess}
              requestedLessonIds={requestedLessonIds}
              light={light}
            />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} light={light} />
              ))}
              {thinking && <TypingIndicator light={light} />}
            </div>
          )}
        </div>

        {/* Composer */}
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
                disabled={selectedGrade === null}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={
                  selectedGrade === null
                    ? "Choose a grade above to begin…"
                    : "Message IM-Telligence AI…"
                }
                className={cn(
                  "max-h-[180px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm focus:outline-none disabled:cursor-not-allowed",
                  light
                    ? "text-slate-900 placeholder:text-slate-400"
                    : "text-white placeholder:text-slate-500"
                )}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || selectedGrade === null}
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
      </div>

      {/* Report rail — hidden while a lesson is open so the viewer + chat get the space */}
      <aside
        className={cn(
          "relative z-10 hidden w-80 shrink-0 flex-col border-l backdrop-blur-xl",
          light ? "border-slate-200/60 bg-white/40" : "border-white/5 bg-slate-950/40",
          openedLesson ? "" : "xl:flex"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b px-5 py-4",
            light ? "border-slate-200/60" : "border-white/5"
          )}
        >
          <FileText size={14} className={light ? "text-slate-500" : "text-slate-400"} />
          <p className={cn("text-sm font-semibold", light ? "text-slate-900" : "text-white")}>
            Session report
          </p>
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-0.5 text-[10px]",
              light ? "bg-slate-200/60 text-slate-600" : "bg-white/5 text-slate-400"
            )}
          >
            {report.length}
          </span>
        </div>
        <div className="chat-scroll flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {report.length === 0 ? (
            <p className={cn("px-1 text-xs", light ? "text-slate-500" : "text-slate-500")}>
              Each lesson action and Q&A will appear here, in real time.
            </p>
          ) : (
            report.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "rounded-xl border px-3 py-2.5 backdrop-blur",
                  light ? "border-slate-200 bg-white/70" : "border-white/5 bg-white/5"
                )}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  {r.kind === "lesson" ? (
                    <FileText size={11} className={light ? "text-brand-600" : "text-brand-300"} />
                  ) : (
                    <HelpCircle size={11} className={light ? "text-brand-600" : "text-brand-300"} />
                  )}
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wider",
                      light ? "text-slate-500" : "text-slate-400"
                    )}
                  >
                    {r.kind === "lesson" ? "Lesson" : "Question"}
                  </span>
                </div>
                <p className={cn("text-xs leading-snug", light ? "text-slate-700" : "text-slate-200")}>
                  {r.summary}
                </p>
              </div>
            ))
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

// Header control to switch the active grade without leaving the conversation.
function GradeMenu({
  grade,
  grades,
  onChange,
  light,
}: {
  grade: number;
  grades: number[];
  onChange: (grade: number) => void;
  light: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const single = grades.length <= 1;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !single && setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition",
          light
            ? "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
            : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
          single && "cursor-default"
        )}
      >
        <GraduationCap size={12} className={light ? "text-brand-600" : "text-brand-300"} />
        Grade {grade}
        {!single && (
          <ChevronDown
            size={12}
            className={cn("transition", open && "rotate-180")}
          />
        )}
      </button>
      {open && !single && (
        <div
          className={cn(
            "absolute right-0 top-[calc(100%+6px)] z-50 w-32 overflow-hidden rounded-xl border shadow-2xl",
            light ? "border-slate-200 bg-white" : "border-white/10 bg-slate-900"
          )}
        >
          {grades.map((g) => (
            <button
              key={g}
              onClick={() => {
                onChange(g);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition",
                g === grade
                  ? light
                    ? "bg-slate-100 text-slate-900"
                    : "bg-white/10 text-white"
                  : light
                  ? "text-slate-700 hover:bg-slate-50"
                  : "text-slate-200 hover:bg-white/5"
              )}
            >
              Grade {g}
              {g === grade && <CheckCircle2 size={13} className="text-brand-500" />}
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
  onOpenLesson,
  onRequestAccess,
  requestedLessonIds,
  light,
}: {
  lessons: Lesson[];
  grade: number;
  onOpenLesson: (lesson: Lesson) => void;
  onRequestAccess: (lesson: Lesson) => void;
  requestedLessonIds: Set<string>;
  light: boolean;
}) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
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
        Teaching <span className="font-medium">Grade {grade}</span>. Open one of your
        lessons to present it, or ask me a question.
      </p>

      {lessons.length === 0 && (
        <p className={cn("mt-6 text-sm", light ? "text-slate-500" : "text-slate-400")}>
          No lessons assigned for Grade {grade} yet.
        </p>
      )}

      {lessons.length > 0 && (
        <div className="mt-8 w-full text-left">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Your lessons
          </p>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            {[...lessons]
              .sort(
                (a, b) =>
                  (a.lessonNo ?? 9999) - (b.lessonNo ?? 9999) ||
                  a.title.localeCompare(b.title)
              )
              .map((l) => (
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

  // Locked lessons show their status and a "Request access" action that pings
  // the super-admin to unlock it.
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      {body}
      {requested ? (
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
  return (
    <div className={cn("msg-in flex gap-3", isUser && "flex-row-reverse")}>
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
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {(message.sourceRef || message.cached) && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
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
        )}
      </div>
    </div>
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
  current,
  onPrev,
  onNext,
  onClose,
  onFullscreen,
  onCompleted,
  light,
}: {
  lesson: Lesson;
  current: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onFullscreen: () => void;
  onCompleted?: () => void;
  light: boolean;
}) {
  const isPdf = Boolean(lesson.fileId);
  const total = lesson.slides.length;
  const slide = isPdf ? undefined : lesson.slides[current - 1];

  return (
    <div
      className={cn(
        "relative z-10 hidden h-full w-3/4 shrink-0 flex-col border-r backdrop-blur-xl md:flex",
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
          Scroll the PDF on the left · ask the AI on the right about it
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
