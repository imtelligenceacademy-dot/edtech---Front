// Core domain types for IM-Telligence frontend.

export type Role = "super-admin" | "school-admin" | "teacher";

export type UserStatus = "active" | "pending" | "suspended" | "rejected";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  schoolId?: string;
  status: UserStatus;
  grades?: string[]; // teacher grade tokens, e.g. ["KG1","G1"]
  language?: "en" | "fr" | "both" | null; // teacher language of instruction
  ictFairAccess?: boolean; // teacher can see the ICT Fair section
  createdAt: string;
  lastLoginAt?: string;
}

// A stored turn of a teacher's conversation, keyed to the lesson it was about.
export interface StoredChatMessage {
  id: string;
  teacherId: string;
  lessonId: string;
  role: "user" | "assistant";
  content: string;
  sourceRef?: string | null;
  createdAt: string;
}

// One lesson's thread, as listed for the super-admin.
export interface ChatThread {
  lessonId: string;
  lessonTitle?: string | null;
  grade?: number | null;
  messageCount: number;
  lastMessageAt?: string | null;
}

export interface FairProject {
  id: string;
  title: string;
  fileId?: string | null;
  /** The section this project is filed under. Null means unfiled — it belongs
   *  to no school yet, so no teacher can see it. */
  sectionId?: string | null;
  createdAt?: string;
}

/** A named group of ICT Fair projects, for one school and one or more grades.
 *  Schools each run their own fair, so the section is what carries the school. */
export interface FairSection {
  id: string;
  schoolId: string;
  schoolName?: string | null;
  title: string;
  blurb?: string | null;
  grades: string[];
  projects: FairProject[];
  createdAt?: string;
}

export interface School {
  id: string;
  name: string;
  country: string;
  city: string;
  programYear: number; // curriculum year the school is on (1 or 2)
  teacherCount: number;
  adminCount: number;
  createdAt?: string;
}

export type LessonStatus = "not-started" | "in-progress" | "completed" | "late";

export type LessonAccessStatus = "available" | "completed" | "waiting" | "locked";

export interface Lesson {
  id: string;
  title: string;
  grade: number;
  subject: string;
  slides: Slide[];
  schoolId?: string | null;
  language?: "en" | "fr" | null;
  year?: number | null; // curriculum year (1 or 2)
  course?: string | null; // "python" | "microbit" | null
  lessonNo?: number | null;
  fileId?: string | null; // linked PDF, rendered in the lesson viewer
  assignedTeacherIds: string[];
  dueDate?: string | null;
  createdBy?: string | null;
  // Sequential-unlock state for the requesting teacher (absent for admins).
  accessStatus?: LessonAccessStatus | null;
  availableAt?: string | null;
  accessMessage?: string | null;
}

// Super-admin lesson-access management view.
export interface TeacherLessonAccessRow {
  lessonId: string;
  title: string;
  grade: number;
  language?: "en" | "fr" | null;
  course?: string | null;
  lessonNo?: number | null;
  status: LessonAccessStatus;
  availableAt?: string | null;
  percentComplete: number;
  completedAt?: string | null;
  unlockedOverride: boolean;
}

export interface TeacherAccessTrack {
  grade: number;
  language?: "en" | "fr" | null;
  year?: number | null;
  lessons: TeacherLessonAccessRow[];
}

export interface TeacherAccess {
  teacherId: string;
  teacherName: string;
  email: string;
  schoolId?: string | null;
  grades: string[];
  language?: "en" | "fr" | "both" | null;
  tracks: TeacherAccessTrack[];
}

export type AccessRequestStatus = "pending" | "granted" | "denied";

// A teacher's request for the super-admin to unlock a locked lesson.
export interface AccessRequest {
  id: string;
  teacherId: string;
  teacherName: string;
  lessonId: string;
  lessonTitle: string;
  grade: number;
  language?: "en" | "fr" | null;
  lessonNo?: number | null;
  status: AccessRequestStatus;
  note?: string | null;
  createdAt: string;
}

export interface Slide {
  id: string;
  index: number;
  title: string;
  body: string;
  imageUrl?: string;
}

export type WatchdogStatus = "on-track" | "late" | "not-opened" | "completed" | "needs-attention";

export interface ProgressEntry {
  id: string;
  teacherId: string;
  lessonId: string;
  status: LessonStatus;
  percentComplete: number;
  // Where the teacher actually stopped. Absent on rows last saved before
  // slide positions were recorded.
  lastSlide?: number | null;
  slideTotal?: number | null;
  lastOpenedAt?: string;
  watchdog: WatchdogStatus;
  watchdogMessage?: string;
}

export type ReportStatus = "pending" | "processing" | "ready" | "failed";

export interface Report {
  id: string;
  title: string;
  scope: "global" | "school";
  schoolId?: string;
  requestedBy: string;
  requestedAt: string;
  status: ReportStatus;
  readyAt?: string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy?: string;
  linkedLessonId?: string;
  createdAt: string;
}

export type SecurityEventType =
  | "normal-login"
  | "foreign-device"
  | "new-ip"
  | "suspicious-location"
  | "blocked-second-device"
  | "failed-login"
  | "account-locked"
  | "password-reset"
  | "signed-out-all";

export interface SecurityLog {
  id: string;
  userId: string;
  userName: string;
  role: Role;
  schoolId?: string;
  ip: string;
  // Empty when location lookups are off, which is the default. Never faked:
  // the table used to print (0.00, 0.00) for every row on earth.
  locationLabel: string;
  locationLat: number | null;
  locationLng: number | null;
  device: string; // the raw User-Agent
  deviceLabel: string; // "Chrome 141 on Windows 11 · Desktop"
  detail: string;
  event: SecurityEventType;
  status: "ok" | "warning" | "blocked";
  timestamp: string;
}

export interface IpHistory {
  signIns: number;
  failedAttempts: number;
  firstSeen: string | null;
  lastSeen: string | null;
  users: string[];
}

export interface ActiveSession {
  id: string;
  deviceLabel: string;
  ip: string;
  createdAt: string;
  expiresAt: string;
  /** Same address and browser as the event — not proof it is the same session. */
  matchesEvent: boolean;
}

export interface SecurityLogDetail {
  log: SecurityLog;
  ipHistory: IpHistory;
  recentEvents: SecurityLog[];
  activeSessions: ActiveSession[];
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cached?: boolean;
  sourceRef?: string; // e.g. "Grade 8 Lesson 2, Slide 4"
  timestamp: string;
  // The lesson this turn belongs to. Conversations are one thread per lesson,
  // so the chat shows only the messages tagged with the lesson in play.
  lessonId?: string | null;
}

export interface Session {
  userId: string;
  role: Role;
  schoolId?: string;
  name: string;
  email: string;
  ictFairAccess?: boolean;
  /** Grades this teacher takes, e.g. ["G7","G8"]. Empty for admins. */
  grades?: string[];
  accessToken?: string;
}

// --- AI usage tracking (super-admin) --------------------------------------- #
// Counts only. There is deliberately no score, band or rating in here: the
// screen reports how many questions a teacher asked and when, and leaves the
// judgement to the person reading it.

/** One calendar day in the report's timezone, and what was asked that day. */
export interface AIUsageDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface AITeacherUsage {
  teacherId: string;
  name: string;
  email: string;
  status: UserStatus;
  schoolId?: string | null;
  schoolName?: string | null;
  grades: string[];

  total: number; // all time
  today: number; // since midnight in the report timezone
  lastHour: number; // rolling 60 minutes — the hourly quota's own window
  last24h: number; // rolling 24 hours — the daily quota's own window
  last7: number;
  prev7: number; // the 7 days before that, for a like-for-like comparison
  last30: number;
  activeDays30: number; // days with at least one question, of the last 30

  firstUsedAt?: string | null;
  lastUsedAt?: string | null;

  hourlyUsed: number;
  dailyUsed: number;

  daily: AIUsageDay[];
}

/** Per-teacher usage plus the exact boundaries every count was taken from, so
 *  the screen can name each window instead of saying "recently". */
export interface AITeacherUsageReport {
  generatedAt: string;
  timezone: string; // IANA name the day buckets were cut in

  todayStart: string;
  hourStart: string;
  dayStart: string;
  weekStart: string;
  prevWeekStart: string;
  windowStart: string;
  dailyDays: number;

  hourlyLimit: number; // 0 means no limit is enforced
  dailyLimit: number;

  teachers: AITeacherUsage[];
}
