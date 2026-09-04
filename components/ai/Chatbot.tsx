"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CheckCircle2,
  Presentation,
  Lock,
  Clock,
  Maximize2,
  ArrowDown,
  RotateCcw,
  Monitor,
  Trash2,
} from "lucide-react";
import { cn, stripMarkdown } from "@/lib/utils";
import {
  getSession,
  logout,
  clearChatMessages,
  listChatMessages,
  listMyAccessRequests,
  listProgress,
  requestLessonAccess,
  saveLessonProgress,
} from "@/lib/api";
import { GradeGate } from "@/components/teacher/GradeGate";
import { ClassGate } from "@/components/teacher/ClassGate";
import { WelcomeScreen } from "@/components/teacher/WelcomeScreen";
import {
  FairButton,
  FairFullscreen,
  FairProjectsScreen,
} from "@/components/teacher/FairProjects";
import { MessageBubble, TypingIndicator } from "@/components/teacher/Transcript";
import { ChatHeader } from "@/components/teacher/ChatHeader";
import { ChatComposer } from "@/components/teacher/ChatComposer";
import { PresentingBar } from "@/components/teacher/PresentingBar";
import { FullscreenPdf, LessonPane } from "@/components/teacher/LessonPane";
import { useTranscriptScroll } from "@/components/teacher/hooks/useTranscriptScroll";
import { useLessonSplit } from "@/components/teacher/hooks/useLessonSplit";
import { useTeacherLessons } from "@/components/teacher/hooks/useTeacherLessons";
import { useChatThread } from "@/components/teacher/hooks/useChatThread";
import { useAiAnswer } from "@/components/teacher/hooks/useAiAnswer";
import { useAiQuota } from "@/components/teacher/AiQuotaNote";
import { usePresenter } from "@/components/teacher/hooks/usePresenter";
import {
  gradePath,
  parseSectionSegment,
  sectionPath,
  sectionsForGrade,
  TEACHER_FAIR,
  TEACHER_HOME,
} from "@/lib/teacher-routes";
import {
  CHAT_STATE_KEY,
  clearChatSession,
  lastTaughtGrade,
  rememberGrade,
  rememberSection,
  type SavedChat,
} from "@/lib/teacher/prefs";
import {
  byLessonNo,
  courseLabel,
  descriptivePart,
  groupLessonsByCourse,
  isMobileViewport,
} from "@/lib/teacher/lesson-order";
import {
  formatUnlockDate,
  lessonLockMessage,
  STARTER_PROMPTS,
} from "@/lib/teacher/lesson-copy";
import {
  COMPLETE_INTENT,
  findLessonByText,
  hasNamedLessonOpenIntent,
  NEXT_LESSON_INTENT,
  OPEN_LESSON_INTENT,
} from "@/lib/teacher/lesson-intents";
import type { AIMessage, FairProject, Lesson, ProgressEntry, Session } from "@/types";

// The route decides which grade is in play (and whether this is the ICT Fair
// view); the component never picks one on its own, so Back and Forward move
// through the session the way a teacher expects.
export function Chatbot({
  grade = null,
  sectionSegment,
  fair = false,
}: {
  grade?: number | null;
  /** The class segment from the URL, for a teacher who takes this grade more
   *  than once. Undefined means they have not picked one yet. */
  sectionSegment?: string;
  fair?: boolean;
} = {}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [openedLesson, setOpenedLesson] = useState<Lesson | null>(null);
  const [openedSlide, setOpenedSlide] = useState(1);
  // The PDF page currently visible in the viewer. Sent with each question so the
  // assistant can inspect that exact slide. Desktop only; null = no visual context.
  const [viewedSlide, setViewedSlide] = useState<number | null>(null);
  // The last lesson opened this session. Kept after the pane is closed so the
  // side panel can offer to bring it back.
  const [lastLesson, setLastLesson] = useState<Lesson | null>(null);
  const selectedGrade = grade;
  const [session, setSession] = useState<Session | null>(null);
  // Whether the session has come back yet, not merely whether it is truthy.
  // Which classes a teacher takes lives on it, and drawing before it lands
  // would show the lessons for a moment and then replace them with a picker.
  const [sessionLoaded, setSessionLoaded] = useState(false);
  // The teacher experience is light-only.
  const light = true;
  const [fullscreenLesson, setFullscreenLesson] = useState<Lesson | null>(null);
  // ICT Fair (shown only to teachers granted access). View-only: a project
  // grid in the main area, and the picked project opens full-screen. No chat
  // grounding, no progress tracking.
  const [fairViewer, setFairViewer] = useState<FairProject | null>(null);
  const showFairProjects = fair;
  // The teacher is reading back through the transcript — don't yank them to the
  // bottom while a reply streams in.
  // Lesson viewer / chat split (desktop): draggable, and the chat can be folded
  // away entirely for full-width presenting.
  // Gate the "save" effect until the previous session has been restored, so an
  // empty first render can't overwrite it.
  const [restored, setRestored] = useState(false);
  const pendingLessonIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The classes this teacher takes for the grade in play. An empty list is the
  // single unnamed class every teacher has by default, and the reason most of
  // them never meet the idea of a class at all.
  const gradeClasses =
    selectedGrade === null ? [] : sectionsForGrade(session?.sections, selectedGrade);
  // Only a teacher who takes this grade more than once has a choice to make.
  const needsClassChoice = gradeClasses.length > 1;
  const chosenSection = needsClassChoice
    ? parseSectionSegment(sectionSegment, gradeClasses)
    : "";
  // Everything below is scoped to one class. While the picker is up there is
  // no class yet, and the empty string means "their first" to the server —
  // harmless, because nothing is written until they have chosen.
  const section = chosenSection ?? "";
  const showClassGate = sessionLoaded && needsClassChoice && chosenSection === null;

  // The teacher's lessons, their progress in them, and their access requests —
  // all for the class in front of them.
  const {
    lessons,
    lessonsLoaded,
    progressByLesson,
    requestedLessonIds,
    classes,
    fairSections,
    refreshLessons,
    requestAccess,
  } = useTeacherLessons(session, section);

  // How the lesson viewer and the assistant share the screen.
  const { paneWidth, setPaneWidth, chatCollapsed, setChatCollapsed, startPaneDrag } =
    useLessonSplit();

  // The lesson on the classroom's second screen, if there is one. It runs
  // before the conversation because presenting decides which lesson is in play,
  // and that in turn decides which thread is on screen — so it speaks into the
  // chat through a ref that is filled in just below.
  const sayRef = useRef<(content: string, extras: Partial<AIMessage>) => void>(
    () => {}
  );
  const {
    presenting,
    presentingRef,
    presentBlocked,
    startPresenting,
    stopPresenting,
    goToPage,
  } = usePresenter({
    section,
    onPageChange: setViewedSlide,
    say: (content, extras) => sayRef.current(content, extras),
    onStart: (lesson) => {
      // The PDF lives on the projector now; this window is the assistant.
      setOpenedLesson(null);
      setLastLesson(lesson);
      setChatCollapsed(false);
    },
    onStop: refreshLessons,
  });

  const gradeLessons =
    selectedGrade === null ? [] : lessons.filter((l) => l.grade === selectedGrade);

  // The lesson a question is grounded in, and the thread it is stored under.
  // With the viewer closed the teacher is still working on a lesson — the one
  // they last had open, or the one they're up to — so questions aren't answered
  // with "open a lesson first". Only an available lesson counts: the backend
  // refuses locked and completed ones.
  const contextLesson = ((): Lesson | null => {
    if (openedLesson) return openedLesson;
    if (presenting) return presenting.lesson;
    const isOpenable = (l: Lesson) => (l.accessStatus ?? "available") === "available";
    const last = lastLesson ? lessons.find((l) => l.id === lastLesson.id) : undefined;
    if (last && isOpenable(last)) return last;
    return [...gradeLessons].sort(byLessonNo).find(isOpenable) ?? null;
  })();
  const contextLessonId = contextLesson?.id ?? null;

  // The conversation for the lesson in play.
  const {
    messages,
    setMessages,
    visibleMessages,
    contextLessonRef,
    pushAssistant,
    pushUser,
    clearThread,
  } = useChatThread(contextLessonId, section);
  sayRef.current = pushAssistant;

  // A question in flight: streaming, stopping, retrying.
  const {
    thinking,
    setThinking,
    streaming,
    failedPrompt,
    setFailedPrompt,
    ask,
    stop: stopStreaming,
    retryLast,
  } = useAiAnswer({ visibleMessages, setMessages, pushAssistant });

  // Re-read the allowance once a reply finishes, so the count under the
  // composer reflects the question that was just spent rather than lagging it.
  const answering = thinking || streaming;
  const quota = useAiQuota(answering);

  // What a question is asked about: the lesson in play and the page on screen.
  const askContext = {
    lessonId: contextLessonId,
    section,
    currentSlide: viewedSlide,
  };

  // Follows the newest message unless the teacher has scrolled up to read.
  const { scrollRef, atBottom, onTranscriptScroll, jumpToLatest, followLatest } =
    useTranscriptScroll([messages, thinking]);

  // Restore the previous session (a refresh mid-class shouldn't cost the chat).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(CHAT_STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SavedChat>;
        pendingLessonIdRef.current = saved.lastLessonId ?? null;
      }
    } catch {
      /* unreadable storage — start fresh */
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      const payload: SavedChat = { lastLessonId: lastLesson?.id ?? null };
      window.sessionStorage.setItem(CHAT_STATE_KEY, JSON.stringify(payload));
    } catch {
      /* quota / private mode — the lesson just won't survive a refresh */
    }
  }, [restored, lastLesson]);

  // A teacher assigned to a single grade has nothing to pick: send them
  // through. replace(), so Back doesn't drop them on a gate they never saw.
  useEffect(() => {
    if (selectedGrade !== null || showFairProjects || !lessonsLoaded) return;
    const grades = Array.from(new Set(lessons.map((l) => l.grade)));
    if (grades.length !== 1) return;
    rememberGrade(grades[0]);
    router.replace(gradePath(grades[0]));
  }, [selectedGrade, showFairProjects, lessonsLoaded, lessons, router]);

  // Keep the remembered grade current while they work in one.
  useEffect(() => {
    if (selectedGrade !== null) rememberGrade(selectedGrade);
  }, [selectedGrade]);

  // The restored lesson id only becomes a Lesson once the list has loaded.
  useEffect(() => {
    const id = pendingLessonIdRef.current;
    if (!id || lessons.length === 0) return;
    pendingLessonIdRef.current = null;
    const match = lessons.find((l) => l.id === id);
    if (match) setLastLesson(match);
  }, [lessons]);

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setSessionLoaded(true));
  }, []);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 180) + "px";
    }
  }, [input]);

  function openLesson(lesson: Lesson) {
    // Sequential unlocking — a teacher can only open their current lesson.
    if (lesson.accessStatus && lesson.accessStatus !== "available") {
      pushAssistant(lessonLockMessage(lesson), { sourceRef: lesson.title });
      return;
    }
    if (showFairProjects) router.push(gradePath(lesson.grade));

    // Already presenting? Move the classroom screen to this lesson instead of
    // opening it only here — otherwise the class sits on the previous lesson
    // while the teacher's controls count pages of a different one.
    if (presentingRef.current) {
      if (lesson.fileId) {
        startPresenting(lesson);
        return;
      }
      stopPresenting();
      pushAssistant(
        `"${lesson.title}" has no PDF to put on the classroom screen, so I've stopped presenting.`
      );
    }

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
      // Tagged with the lesson being opened. The ref still holds the previous
      // one until React re-renders, and a message filed under the old thread
      // would vanish the moment the new one takes over.
      lessonId: lesson.id,
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
      await saveLessonProgress(lesson.id, { complete: true, section });
      refreshLessons();
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
    pushUser(text);
    setInput("");
    setFailedPrompt(null);
    // Sending is an intent to follow the answer.
    followLatest();

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
    void ask(text, askContext);
  }

  const isEmpty = visibleMessages.length === 0;

  // The lesson the side panel acts on: whatever is open, else the last one
  // opened - resolved against `lessons` so its access status stays current.
  const panelTarget = openedLesson ?? lastLesson;
  const panelLesson = panelTarget
    ? lessons.find((l) => l.id === panelTarget.id) ?? panelTarget
    : null;

  // Grades the teacher actually has lessons for, and the lessons in the chosen one.
  const availableGrades = Array.from(new Set(lessons.map((l) => l.grade))).sort(
    (a, b) => a - b
  );

  // Picking a grade is a navigation: /teacher -> /teacher/grade-7.
  function chooseGrade(grade: number) {
    setOpenedLesson(null);
    setLastLesson(null);
    rememberGrade(grade);
    router.push(gradePath(grade));
  }

  // One class of the grade already in play. Its own route, so Back returns to
  // the class picker rather than out of the grade — and so a teacher can
  // bookmark the class they teach on Mondays.
  function chooseClass(section: string) {
    if (selectedGrade === null) return;
    setOpenedLesson(null);
    setLastLesson(null);
    rememberSection(selectedGrade, section);
    router.push(sectionPath(selectedGrade, section));
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
          section={section}
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
          onPresent={() => startPresenting(openedLesson)}
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
          section={section}
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
        <ChatHeader
          session={session}
          canStartNewChat={
            selectedGrade !== null || messages.length > 0 || showFairProjects
          }
          onNewChat={resetSession}
          showFairProjects={showFairProjects}
          onOpenFair={openFairProjects}
          light={light}
        />


        {/* Required first step: pick a grade, then the chat / welcome */}
        <div
          ref={scrollRef}
          onScroll={onTranscriptScroll}
          className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"
        >
          {showFairProjects ? (
            <FairProjectsScreen
              sections={fairSections}
              teacherGrades={session?.grades ?? []}
              onOpen={openFairProject}
            />
          ) : selectedGrade === null ? (
            <GradeGate
              grades={availableGrades}
              classes={classes}
              loading={!lessonsLoaded}
              onPick={chooseGrade}
              light={light}
            />
          ) : showClassGate ? (
            <ClassGate
              grade={selectedGrade}
              classes={classes.filter((c) => c.grade === selectedGrade)}
              loading={!lessonsLoaded}
              onPick={chooseClass}
              onBack={() => router.push(TEACHER_HOME)}
              light={light}
            />
          ) : isEmpty ? (
            <WelcomeScreen
              lessons={gradeLessons}
              grade={selectedGrade}
              progressByLesson={progressByLesson}
              onOpenLesson={openLesson}
              onRequestAccess={(lesson) => requestAccess(lesson, pushAssistant)}
              onPrompt={(text) => send(text)}
              requestedLessonIds={requestedLessonIds}
              light={light}
            />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {visibleMessages.map((m) => (
                <MessageBubble key={m.id} message={m} light={light} />
              ))}
              {failedPrompt && !thinking && !streaming && (
                <div className="flex justify-center">
                  <button
                    onClick={() => retryLast(askContext)}
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

        {/* Presenting: the class sees the page, the teacher drives it from here */}
        {presenting && (
          <PresentingBar
            lesson={presenting.lesson}
            section={section}
            page={presenting.page}
            total={presenting.total}
            onPrev={() => goToPage(presenting.page - 1)}
            onNext={() => goToPage(presenting.page + 1)}
            onStop={() => stopPresenting()}
            onCompleted={() => {
              stopPresenting();
            }}
            light={light}
          />
        )}
        {presentBlocked && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] text-amber-800 sm:px-8">
            Your browser blocked the presentation window. Allow pop-ups for this
            site, then press Present again.
          </div>
        )}

        {/* Reading back through the transcript while a reply streams in */}
        {!atBottom && visibleMessages.length > 0 && (
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

        {/* Hidden on the grade gate (the assistant isn't usable until a grade
            is picked) and in ICT Fair mode (view-only, no chat) */}
        {!showFairProjects && selectedGrade !== null && (
          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={() => send()}
            onStop={stopStreaming}
            busy={thinking || streaming}
          quota={quota}
            inputRef={inputRef}
            light={light}
          />
        )}
      </div>

      {/* Lesson rail — quick actions for the lesson in play. Hidden on the
          grade gate (there is no lesson yet), on the class gate (the actions
          here belong to a class, and none has been picked — offering "Request
          access" would file it against whichever class came first), and while
          the viewer pane is open (the viewer already offers these) so the PDF
          and chat get the full width. */}
      <aside
        className={cn(
          "relative z-10 hidden w-80 shrink-0 flex-col border-l backdrop-blur-xl",
          light ? "border-slate-200/60 bg-white/40" : "border-white/5 bg-slate-950/40",
          openedLesson || showFairProjects || selectedGrade === null || showClassGate
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
                {panelLesson.fileId && !presenting && (
                  <button
                    onClick={() => startPresenting(panelLesson)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition",
                      light
                        ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                    )}
                  >
                    <Monitor size={13} /> Present on second screen
                  </button>
                )}
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
                {contextLessonId && (
                  <button
                    onClick={() => clearThread(pushAssistant)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition",
                      light
                        ? "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Trash2 size={13} /> Clear this lesson&apos;s chat
                  </button>
                )}
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
                  // A lesson that is merely not open yet can be asked for. A
                  // finished one cannot, because there is nothing to ask for.
                  const canRequest = status === "locked" || status === "waiting";
                  const requested = requestedLessonIds.has(l.id);
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-[11px] transition",
                        isOpen
                          ? "border-brand/40 bg-brand-50/60"
                          : light
                          ? "border-transparent hover:border-slate-200 hover:bg-white/70"
                          : "border-transparent hover:border-white/10 hover:bg-white/5"
                      )}
                    >
                      <button
                        onClick={() => openLesson(l)}
                        title={l.title}
                        className="flex w-full items-center gap-2 text-left"
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

                      {/* Asking sits under the title rather than beside it. The
                          rail is narrow and the titles already truncate, so a
                          second line costs less than a squeezed one — and it
                          reads as a sentence about this lesson rather than as
                          an icon needing to be guessed at. */}
                      {canRequest && (
                        <p className="mt-0.5 flex items-center gap-1 pl-5 text-[11px] text-slate-500">
                          <span>
                            {status === "waiting"
                              ? `Unlocks ${formatUnlockDate(l.availableAt)}`
                              : "Locked"}
                          </span>
                          <span aria-hidden>·</span>
                          {requested ? (
                            <span className="flex items-center gap-0.5 font-medium text-emerald-700">
                              <CheckCircle2 size={11} /> Requested
                            </span>
                          ) : (
                            <button
                              onClick={() => requestAccess(l, pushAssistant)}
                              className="flex items-center gap-0.5 font-medium text-brand-700 underline underline-offset-2 transition hover:text-brand-800"
                            >
                              <BellRing size={11} /> Request access
                            </button>
                          )}
                        </p>
                      )}
                    </div>
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
