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
  X,
} from "lucide-react";
import { cn, stripMarkdown } from "@/lib/utils";
import { gradeTitle, isKindergarten } from "@/lib/grades";
import { userCan } from "@/lib/permissions";
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
  isQuestionAboutAnAction,
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
  // Kindergarten runs MTiny, which the assistant has never read. That holds two
  // ways: a teacher who takes only kindergarten never sees the assistant at all,
  // and *any* teacher looking at a kindergarten grade sees the lesson launcher
  // and no conversation, whatever else she teaches. A mixed KG-and-Grade-1
  // teacher keeps the assistant on her Grade 1 page and loses it here, because
  // the question she would ask on this page is about a lesson it has not read.
  //
  // The grade comes from the route, so this half is known on first paint and the
  // chat never appears and is then taken away. The account half is read as
  // "known not to have it" rather than "not known to have it": until the session
  // lands every teacher is treated as having the assistant, which is exactly
  // what happened before this existed. Getting that wrong for an instant costs
  // nothing — the server refuses the request on the same rules, so the composer
  // could not have sent anything regardless.
  const assistantHidden =
    (grade !== null && isKindergarten(grade)) ||
    (sessionLoaded && !userCan(session, "use-ai-assistant"));
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
  // Below xl the lesson rail is a sheet rather than a column, because there is
  // no room for both it and the conversation. Closed by default.
  const [railOpen, setRailOpen] = useState(false);
  // Whether the teacher has said something this visit — sent a question,
  // clicked a starter prompt, asked for access, tried a locked lesson. The
  // reply to any of those lands in the transcript, so from that moment the
  // transcript must be the thing on screen. Without this, a question asked
  // from the launcher was billed and answered into a screen that never
  // rendered it. Reset when the grade changes: each grade arrives at its own
  // launcher.
  const [engaged, setEngaged] = useState(false);
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
  // Whether there is a lesson rail at all: not on the grade gate (no lesson
  // yet), not on the class gate (its actions belong to a class, and none has
  // been picked), not in ICT Fair (view-only), and not while the viewer pane is
  // open (the viewer already offers the same actions).
  const railUsable =
    !showFairProjects && selectedGrade !== null && !showClassGate;
  const railAvailable = railUsable && !openedLesson;
  // From md up, an open lesson replaces the rail with the viewer, which offers
  // the same actions. Below md that viewer is not rendered at all — the phone
  // reads a lesson in the full-screen viewer instead — so once a teacher backs
  // out of it the rail is the only way left to reopen the lesson, mark it
  // complete or ask for access. Suppressing it there left them with a
  // conversation and no lesson controls at all.
  const railMobileOnly = railUsable && !!openedLesson;
  const railShown = railAvailable || railMobileOnly;
  // Where the rail stops being a sheet — written once and used by both the rail
  // and the backdrop that dims it. Written out separately they disagreed: the
  // rail hides at md when a lesson is open, the backdrop hid at xl in every
  // case, so between 768px and 1279px with a lesson open the backdrop covered
  // the whole app with no rail on it. Rotating a phone to landscape is enough
  // to get there, and nothing on screen then says how to get out.
  const railSheetHidden = railMobileOnly ? "md:hidden" : "xl:hidden";

  // The teacher's lessons, their progress in them, and their access requests —
  // all for the class in front of them.
  const {
    lessons,
    lessonsLoaded,
    lessonsError,
    progressByLesson,
    requestedLessonIds,
    classes,
    fairSections,
    refreshLessons,
    requestAccess,
  } = useTeacherLessons(session, section);

  // How the lesson viewer and the assistant share the screen.
  // An open lesson takes the whole screen either because the teacher folded the
  // conversation away to present, or because they never had one to fold: with
  // no assistant there is nothing on the right but a launcher for the lesson
  // already open.
  const { paneWidth, setPaneWidth, chatCollapsed, setChatCollapsed, startPaneDrag } =
    useLessonSplit();
  const lessonFullWidth = chatCollapsed || assistantHidden;

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
    dismissPresentBlocked,
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

  // The lesson the teacher is actually working in. Presenting deliberately
  // closes the pane — the PDF is on the projector and this window is the
  // assistant — so `openedLesson` is null for the whole of a lesson being
  // taught, which is exactly when these actions get used. Narrower than
  // `contextLesson` below on purpose: that one falls back to the lesson they
  // are up to, which is right for grounding a question and wrong for marking
  // something complete.
  const activeLesson = openedLesson ?? presenting?.lesson ?? null;

  // The lesson a question is grounded in, and the thread it is stored under.
  // With the viewer closed the teacher is still working on a lesson — the one
  // they last had open, or the one they're up to — so questions aren't answered
  // with "open a lesson first". Only an available lesson counts: the backend
  // refuses locked and completed ones.
  const contextLesson = ((): Lesson | null => {
    const isOpenable = (l: Lesson) => (l.accessStatus ?? "available") === "available";
    // Re-read from the refreshed list rather than trusted as held. Completing a
    // lesson from the chat refreshes `lessons` but resyncs neither
    // `openedLesson` nor `presenting.lesson`, so both kept the "available" they
    // were opened with — and every question after "I've finished the lesson"
    // was grounded in a lesson this file states twice that the backend refuses.
    const fresh = (l: Lesson) => gradeLessons.find((g) => g.id === l.id) ?? l;
    if (openedLesson) {
      const current = fresh(openedLesson);
      if (isOpenable(current)) return current;
    }
    if (presenting) {
      const current = fresh(presenting.lesson);
      if (isOpenable(current)) return current;
    }
    // Searched within this grade, not the whole assignment list: the lesson
    // last opened may belong to another grade entirely, and grounding a Grade 5
    // question in it filed the answer under Grade 5's neighbour.
    const last = lastLesson ? gradeLessons.find((l) => l.id === lastLesson.id) : undefined;
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
    failedThread,
    clearFailedPrompt,
    ask,
    stop: stopStreaming,
    retryLast,
  } = useAiAnswer({ visibleMessages, setMessages, pushAssistant });

  // Re-read the allowance once a reply finishes, so the count under the
  // composer reflects the question that was just spent rather than lagging it.
  const answering = thinking || streaming;
  const quota = useAiQuota(answering, !assistantHidden);

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
    // Nothing to save yet, and something still to restore: leave what is
    // stored alone. Writing null the moment `restored` flipped erased the id
    // this component had just read but not yet applied — so stepping into ICT
    // Fair (which unmounts this, and has no grade to apply it to) and back
    // came home to the launcher rather than the lesson.
    if (!lastLesson && pendingLessonIdRef.current) return;
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

  // Each grade (and each class of it) arrives at its own launcher; what the
  // teacher said standing in another one does not carry the screen with it.
  useEffect(() => {
    setEngaged(false);
  }, [selectedGrade, section]);

  // The rail sheet closes itself whenever there stops being a rail to show —
  // opening a lesson, switching to ICT Fair — so it is never left standing over
  // a screen it does not belong to, or found already open on the way back.
  useEffect(() => {
    if (!railShown) setRailOpen(false);
  }, [railShown]);

  // Escape closes the sheet, as it does the other overlays here.
  useEffect(() => {
    if (!railOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRailOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [railOpen]);

  // The restored lesson id only becomes a Lesson once the list has loaded.
  useEffect(() => {
    const id = pendingLessonIdRef.current;
    if (!id || lessons.length === 0 || selectedGrade === null) return;
    pendingLessonIdRef.current = null;
    const match = lessons.find((l) => l.id === id);
    // Only into the grade it belongs to. Remembered across a refresh, it would
    // otherwise open on whichever grade the teacher happened to arrive at.
    if (!match || match.grade !== selectedGrade) return;
    setLastLesson(match);
    // Opened, not just remembered. Coming back to a lesson and finding a
    // conversation about it — with the lesson itself nowhere on screen — is
    // the transcript without the thing it is about. Only while it is still
    // theirs to open: an admin may have locked it since, and a completed one
    // is finished.
    if ((match.accessStatus ?? "available") === "available") {
      setOpenedLesson(match);
      setOpenedSlide(1);
    }
  }, [lessons, selectedGrade]);

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
    // The rail sheet has done its job once a lesson is chosen; leaving it up
    // would cover the thing the teacher just asked to see.
    setRailOpen(false);
    // Sequential unlocking — a teacher can only open their current lesson.
    if (lesson.accessStatus && lesson.accessStatus !== "available") {
      // The explanation goes into the transcript, so the transcript must show.
      setEngaged(true);
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
    pushAssistant(
      `Opening "${lesson.title}" — ${gradeTitle(lesson.grade)}. ${detail}`,
      {
        sourceRef: lesson.title,
        // Tagged with the lesson being opened. The ref still holds the previous
        // one until React re-renders, and a message filed under the old thread
        // would vanish the moment the new one takes over.
        lessonId: lesson.id,
      }
    );
  }

  // "I finished the lesson" — record the open lesson as complete.
  async function markCurrentComplete() {
    if (!activeLesson) {
      setThinking(false);
      pushAssistant(
        "Open a lesson first, then tell me you've finished and I'll mark it complete for you."
      );
      return;
    }
    const lesson = activeLesson;
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
    if (activeLesson) {
      const idx = sorted.findIndex((l) => l.id === activeLesson.id);
      next = idx >= 0 ? sorted[idx + 1] : undefined;
    } else {
      // Nothing open and nothing on the board: start from the first lesson
      // this class has not finished. Reached while presenting, this picked the
      // lesson already on the screen — it is not completed — and re-presented
      // it, sending the class back to page 1 of the lesson they were on.
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
    // A reply is already being written. Pressing Enter again used to start a
    // second stream over the top of it: two questions spent, two answers
    // interleaved in the transcript, and Stop reaching only the newer one.
    if (thinking || streaming) return;
    setEngaged(true);
    pushUser(text);
    setInput("");
    clearFailedPrompt();
    // Sending is an intent to follow the answer.
    followLatest();

    // Lesson actions are handled by the app itself (not the LLM) — but only
    // when the teacher is telling the app to do something, not asking it a
    // question about doing it. "How do I mark it as complete?" was read as
    // "mark it as complete".
    const asking = isQuestionAboutAnAction(text);
    // Completing is the destructive one: it locks the lesson and starts the
    // next one's wait, and only an admin can undo it. A trailing question mark
    // is enough to hold it back and let the model answer instead.
    if (!asking && !/\?\s*$/.test(text) && COMPLETE_INTENT.test(text)) {
      setThinking(true);
      void markCurrentComplete();
      return;
    }
    if (!asking && NEXT_LESSON_INTENT.test(text)) {
      openNextLesson();
      return;
    }
    if (!asking && hasNamedLessonOpenIntent(text)) {
      const named = findLessonByText(text, gradeLessons);
      if (named) {
        openLesson(named);
        return;
      }
    }
    if (!asking && OPEN_LESSON_INTENT.test(text)) {
      openCurrentLesson();
      return;
    }

    // Otherwise it's a question for the grounded AI assistant.
    void ask(text, askContext);
  }

  const isEmpty = visibleMessages.length === 0;
  // The launcher replaces the transcript outright for a teacher without the
  // assistant: there is no conversation to fall back to, so this screen is
  // where they open, present and complete their lessons.
  //
  // It also stays up until a lesson has actually been opened. A question is
  // grounded in the lesson a teacher is up to whether or not they have opened
  // it, so arriving at a grade pulled that lesson's stored thread and put the
  // transcript on screen straight away — no lesson open, and the one screen
  // that offers to open one replaced by a conversation about it.
  const openedHereBefore =
    !!lastLesson && gradeLessons.some((l) => l.id === lastLesson.id);
  const noLessonOpenedYet = !openedLesson && !openedHereBefore;
  // `isEmpty` first and unconditionally: there is never anything to gain by
  // replacing the launcher with an empty transcript, and doing so would leave
  // the middle of the screen blank. Past that, the launcher holds the screen
  // until the teacher either opens a lesson here or says something — and the
  // reply to anything they say lands in the transcript, which is why speaking
  // has to hand the screen over.
  const showLauncher =
    assistantHidden || isEmpty || (!engaged && noLessonOpenedYet);

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
    // The same two things `openLesson` does, for the same two reasons.
    //
    // Below md the lesson pane is `hidden md:flex`, so setting `openedLesson`
    // alone put the lesson somewhere a phone does not render it: the rail's
    // primary button did nothing whatsoever, and the sheet stayed up over the
    // nothing it had done. And the sheet has to be told to close — `railShown`
    // is still true with a lesson open, which is what keeps the rail reachable
    // on a phone, so the effect that closes it never fires here.
    setRailOpen(false);
    setOpenedLesson(fresh);
    if (fresh.fileId && isMobileViewport()) setFullscreenLesson(fresh);
  }

  // Return to the clean starting screen (grade picker) with an empty session.
  function resetSession() {
    stopStreaming();
    clearChatSession();
    setEngaged(false);
    clearFailedPrompt();
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
          width={lessonFullWidth ? 100 : paneWidth}
          chatCollapsed={chatCollapsed}
          onToggleChat={() => setChatCollapsed((v) => !v)}
          assistant={!assistantHidden}
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

      {/* Drag handle between the lesson and the chat (desktop layout only).
          Nothing to drag when the lesson has the screen to itself. */}
      {openedLesson && !lessonFullWidth && (
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

      {/* Chat column — folded away while presenting full-width.
          For a teacher with no assistant it goes only from md up, where the
          lesson pane exists to replace it. Below md that pane is not rendered
          at all (the phone reads a lesson in the full-screen viewer), so
          hiding this as well would leave them looking at nothing. */}
      <div
        className={cn(
          "relative z-10 h-full min-h-0 min-w-0 flex-1 flex-col",
          openedLesson && chatCollapsed
            ? "hidden"
            : openedLesson && assistantHidden
            ? "flex md:hidden"
            : "flex"
        )}
      >
        <ChatHeader
          session={session}
          canStartNewChat={
            !assistantHidden &&
            (selectedGrade !== null || messages.length > 0 || showFairProjects)
          }
          onNewChat={resetSession}
          showFairProjects={showFairProjects}
          onOpenFair={openFairProjects}
          showLessonsButton={railShown}
          lessonsButtonMobileOnly={railMobileOnly}
          onOpenLessons={() => setRailOpen(true)}
          assistant={!assistantHidden}
          light={light}
        />


        {/* Required first step: pick a grade, then the chat / welcome */}
        <div
          ref={scrollRef}
          onScroll={onTranscriptScroll}
          className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 short:py-2"
        >
          {showFairProjects ? (
            <FairProjectsScreen sections={fairSections} onOpen={openFairProject} />
          ) : selectedGrade === null ? (
            <GradeGate
              grades={availableGrades}
              classes={classes}
              loading={!lessonsLoaded}
              loadError={lessonsError}
              onRetry={refreshLessons}
              onPick={chooseGrade}
              assistant={!assistantHidden}
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
          ) : showLauncher ? (
            <WelcomeScreen
              lessons={gradeLessons}
              grade={selectedGrade}
              progressByLesson={progressByLesson}
              onOpenLesson={openLesson}
              onRequestAccess={(lesson) => {
                setEngaged(true);
                void requestAccess(lesson, pushAssistant);
              }}
              onPrompt={(text) => send(text)}
              assistant={!assistantHidden}
              requestedLessonIds={requestedLessonIds}
              loadError={lessonsError}
              onRetry={refreshLessons}
              light={light}
            />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 short:gap-3">
              {visibleMessages.map((m) => (
                <MessageBubble key={m.id} message={m} light={light} />
              ))}
              {failedPrompt &&
                failedThread &&
                failedThread.lessonId === contextLessonId &&
                failedThread.section === section &&
                !thinking &&
                !streaming && (
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
          <div className="flex items-start gap-3 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-[11px] text-amber-800 sm:px-8">
            <span className="flex-1">
              Your browser blocked the presentation window. Allow pop-ups for
              this site, then press Present again.
            </span>
            <button
              type="button"
              onClick={dismissPresentBlocked}
              aria-label="Dismiss"
              className="-my-0.5 shrink-0 rounded p-0.5 text-amber-700 transition hover:bg-amber-100 hover:text-amber-900"
            >
              <X size={13} />
            </button>
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

        {/* Hidden for a teacher who does not have the assistant at all, on the
            grade gate (it isn't usable until a grade is picked), on the class
            gate (a question asked before a class is chosen has no lesson
            behind it, and still spends one of the teacher's hourly questions),
            and in ICT Fair mode (view-only, no chat). */}
        {!assistantHidden &&
          !showFairProjects &&
          selectedGrade !== null &&
          !showClassGate && (
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

      {/* Below xl the rail sits over the chat instead of beside it, and the
          backdrop is how it is dismissed. There is no room for a 320px column
          next to a conversation on a phone, but the rail is the only way to
          open a lesson, mark one complete or ask for access — so it has to be
          reachable, not merely absent. */}
      {railShown && railOpen && (
        <div
          onClick={() => setRailOpen(false)}
          className={cn(
            "fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px]",
            railSheetHidden
          )}
          aria-hidden
        />
      )}

      {/* Lesson rail — quick actions for the lesson in play. Hidden on the
          grade gate (there is no lesson yet), on the class gate (the actions
          here belong to a class, and none has been picked — offering "Request
          access" would file it against whichever class came first), and while
          the viewer pane is open (the viewer already offers these) so the PDF
          and chat get the full width. */}
      <aside
        className={cn(
          "w-80 shrink-0 flex-col border-l backdrop-blur-xl",
          // A sheet below xl, the static column it has always been from xl up.
          "fixed inset-y-0 right-0 z-40 max-w-[85%] shadow-2xl transition-transform duration-200 ease-out",
          "xl:relative xl:z-10 xl:max-w-none xl:translate-x-0 xl:shadow-none xl:transition-none",
          // Opaque as a sheet, translucent as a column. The 40% wash reads fine
          // against the page it has always sat on, but over a dimmed backdrop it
          // turns the lesson list grey on grey.
          light
            ? "border-slate-200/60 bg-white xl:bg-white/40"
            : "border-white/5 bg-slate-900 xl:bg-slate-950/40",
          railAvailable ? "flex" : railMobileOnly ? `flex ${railSheetHidden}` : "hidden",
          railOpen ? "translate-x-0" : "translate-x-full"
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
          {/* Only the sheet needs dismissing; from xl the rail is just there. */}
          <button
            onClick={() => setRailOpen(false)}
            aria-label="Close"
            className={cn(
              "-my-2 -mr-2 ml-auto flex h-10 w-10 items-center justify-center rounded-lg transition xl:hidden",
              light ? "text-slate-500 hover:bg-slate-100" : "text-slate-400 hover:bg-white/10"
            )}
          >
            <X size={16} />
          </button>
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
                {gradeTitle(panelLesson.grade)}
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
                    onClick={() => {
                      setRailOpen(false);
                      startPresenting(panelLesson);
                    }}
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
                  onClick={() => {
                    setRailOpen(false);
                    setFullscreenLesson(panelLesson);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition",
                    light
                      ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  )}
                >
                  <Maximize2 size={13} /> Full screen
                </button>
                {!assistantHidden && (
                  <button
                    // The card's own lesson, not whatever the assistant is
                    // grounded in. Those part company as soon as this lesson is
                    // completed — the card still shows it, the context has moved
                    // to the next openable one — and this button then deleted a
                    // thread it was not named after, irreversibly.
                    onClick={() => clearThread(pushAssistant, panelLesson.id)}
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
                      {/* Roomier rows below xl, where this list is a sheet a
                          teacher taps with a thumb rather than a column she
                          clicks. A 17px row is not a target. Unchanged at xl. */}
                      <button
                        onClick={() => openLesson(l)}
                        title={l.title}
                        className="flex w-full items-center gap-2 py-3 text-left xl:py-0"
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
                              onClick={() => {
                                setEngaged(true);
                                void requestAccess(l, pushAssistant);
                              }}
                              // The pseudo-element is the touch area; the link
                              // itself keeps its place in the sentence.
                              className="relative flex items-center gap-0.5 font-medium text-brand-700 underline underline-offset-2 transition after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:text-brand-800"
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
