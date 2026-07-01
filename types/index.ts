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
  createdAt: string;
  lastLoginAt?: string;
}

export interface School {
  id: string;
  name: string;
  country: string;
  city: string;
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
  | "blocked-second-device";

export interface SecurityLog {
  id: string;
  userId: string;
  userName: string;
  role: Role;
  schoolId?: string;
  ip: string;
  location: { lat: number; lng: number; label: string };
  device: string;
  event: SecurityEventType;
  status: "ok" | "warning" | "blocked";
  timestamp: string;
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cached?: boolean;
  sourceRef?: string; // e.g. "Grade 8 Lesson 2, Slide 4"
  timestamp: string;
}

export interface Session {
  userId: string;
  role: Role;
  schoolId?: string;
  name: string;
  email: string;
}
