"use client";

import type {
  AccessRequest,
  Lesson,
  ProgressEntry,
  Report,
  Role,
  School,
  SecurityLog,
  Session,
  TeacherAccess,
  TeacherLessonAccessRow,
  UploadedFile,
  User,
  UserStatus,
} from "@/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type RequestOptions = RequestInit & { skipRefresh?: boolean };

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    const message =
      typeof data?.detail === "string"
        ? data.detail
        : "Request failed. Please try again.";
    throw new Error(message);
  }
  return data as T;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipRefresh, headers, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

  if (response.status === 401 && !skipRefresh && path !== "/api/auth/refresh") {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) {
      return apiFetch<T>(path, { ...options, skipRefresh: true });
    }
  }

  return parseResponse<T>(response);
}

// --- Database backup (super-admin) ----------------------------------------- #
export async function downloadDatabase(retried = false): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/admin/db/download`, {
    credentials: "include",
  });
  if (res.status === 401 && !retried) {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return downloadDatabase(true);
  }
  if (!res.ok) throw new Error("Could not generate the backup.");

  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const filename = m ? decodeURIComponent(m[1]) : "im-telligence-backup.db";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function emailDatabase(recipients: string[], note?: string) {
  return apiFetch<{ message: string }>("/api/admin/db/email", {
    method: "POST",
    body: JSON.stringify({ recipients, note }),
  });
}

export function wipeDatabase() {
  return apiFetch<{ message: string }>("/api/admin/db/wipe", { method: "POST" });
}

export async function restoreDatabase(file: File, retried = false): Promise<{ message: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/admin/db/restore`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (res.status === 401 && !retried) {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return restoreDatabase(file, true);
  }
  return parseResponse<{ message: string }>(res);
}

export function homePathFor(role: Role): string {
  switch (role) {
    case "super-admin":
      return "/super-admin/dashboard";
    case "school-admin":
      return "/school-admin/dashboard";
    case "teacher":
      return "/teacher/ai";
  }
}

export async function login(email: string, password: string): Promise<Session> {
  return apiFetch<Session>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipRefresh: true,
  });
}

export async function logout() {
  await apiFetch<{ message: string }>("/api/auth/logout", {
    method: "POST",
    skipRefresh: true,
  }).catch(() => undefined);
}

export function getSession() {
  return apiFetch<Session>("/api/auth/me");
}

export function listSchools() {
  return apiFetch<School[]>("/api/schools");
}

export function createSchool(payload: Pick<School, "name" | "city" | "country">) {
  return apiFetch<School>("/api/schools", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSchool(
  schoolId: string,
  payload: Partial<Pick<School, "name" | "city" | "country">>
) {
  return apiFetch<School>(`/api/schools/${schoolId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteSchool(schoolId: string) {
  return apiFetch<void>(`/api/schools/${schoolId}`, { method: "DELETE" });
}

export function listUsers() {
  return apiFetch<User[]>("/api/users");
}

export function createUser(payload: {
  name: string;
  email: string;
  password: string;
  role: Role;
  schoolId?: string;
  grades?: string[];
  language?: "en" | "fr" | "both";
}) {
  return apiFetch<User>("/api/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUserStatus(userId: string, status: UserStatus) {
  return apiFetch<User>(`/api/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateUser(
  userId: string,
  payload: Partial<{
    name: string;
    email: string;
    role: Role;
    schoolId: string | null;
    grades: string[];
    language: "en" | "fr" | "both";
  }>
) {
  return apiFetch<User>(`/api/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteUser(userId: string) {
  return apiFetch<void>(`/api/users/${userId}`, { method: "DELETE" });
}

export function resetUserPassword(userId: string, password: string) {
  return apiFetch<{ message: string }>(`/api/users/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function listLessons() {
  return apiFetch<Lesson[]>("/api/lessons");
}

// --- Lesson access requests (teacher -> super-admin) ------------------------ #
export function requestLessonAccess(lessonId: string, note?: string) {
  return apiFetch<AccessRequest>("/api/access-requests", {
    method: "POST",
    body: JSON.stringify({ lessonId, note }),
  });
}

export function listMyAccessRequests() {
  return apiFetch<AccessRequest[]>("/api/access-requests/mine");
}

export function listAccessRequests() {
  return apiFetch<AccessRequest[]>("/api/access-requests");
}

export function grantAccessRequest(requestId: string) {
  return apiFetch<AccessRequest>(`/api/access-requests/${requestId}/grant`, {
    method: "POST",
  });
}

export function denyAccessRequest(requestId: string) {
  return apiFetch<AccessRequest>(`/api/access-requests/${requestId}/deny`, {
    method: "POST",
  });
}

// --- Super-admin: per-teacher sequential-unlock management ------------------ #
export function getTeacherAccess(teacherId: string) {
  return apiFetch<TeacherAccess>(`/api/lessons/access/${teacherId}`);
}

export function setLessonOverride(
  teacherId: string,
  lessonId: string,
  unlocked: boolean
) {
  return apiFetch<TeacherLessonAccessRow>(
    `/api/lessons/access/${teacherId}/${lessonId}`,
    { method: "PATCH", body: JSON.stringify({ unlocked }) }
  );
}

export function assignTeacher(lessonId: string, teacherId: string) {
  return apiFetch<Lesson>(`/api/lessons/${lessonId}/assign`, {
    method: "POST",
    body: JSON.stringify({ teacherId }),
  });
}

export function unassignTeacher(lessonId: string, teacherId: string) {
  return apiFetch<Lesson>(`/api/lessons/${lessonId}/assign/${teacherId}`, {
    method: "DELETE",
  });
}

export function listProgress() {
  return apiFetch<ProgressEntry[]>("/api/progress");
}

// Teacher self-reports the slide they stopped at, or marks the lesson complete.
export function saveLessonProgress(
  lessonId: string,
  payload: { slide?: number; total?: number; complete?: boolean }
) {
  return apiFetch<ProgressEntry>(`/api/progress/${lessonId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type AIChatTurn = { role: "user" | "assistant"; content: string };

export function askTeacherAI(payload: {
  message: string;
  lessonId?: string | null;
  history?: AIChatTurn[];
}) {
  return apiFetch<{ content: string; sourceRef: string | null; provider: string }>(
    "/api/ai/chat",
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function aiHealth() {
  return apiFetch<{ provider: string; model: string | null; ready: boolean }>(
    "/api/ai/health"
  );
}

export type AIUsageStats = {
  last7: number;
  prev7: number;
  deltaPct: number | null;
};

// AI-assistant interaction counts, scoped to the caller's school (super-admins
// see all schools). Powers the dashboard "AI usage (7d)" metric.
export function getAIUsage() {
  return apiFetch<AIUsageStats>("/api/ai/usage");
}

type StreamHandlers = {
  onDelta: (text: string) => void;
  onMeta?: (m: { sourceRef?: string }) => void;
};

// Shared SSE stream reader with one auth-refresh retry.
async function streamSSE(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
  retried = false
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 401 && !retried) {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return streamSSE(path, body, handlers, true);
  }
  if (!res.ok || !res.body) {
    throw new Error("The AI assistant is unavailable right now.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      const line = evt.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let obj: { delta?: string; sourceRef?: string; done?: boolean; error?: string };
      try {
        obj = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (obj.error) throw new Error(obj.error);
      if (obj.sourceRef && handlers.onMeta) handlers.onMeta({ sourceRef: obj.sourceRef });
      if (obj.delta) handlers.onDelta(obj.delta);
      if (obj.done) return;
    }
  }
}

// Teacher assistant — streamed, grounded in the open lesson.
export function streamTeacherAI(
  payload: { message: string; lessonId?: string | null; history?: AIChatTurn[] },
  handlers: StreamHandlers
): Promise<void> {
  return streamSSE("/api/ai/chat/stream", payload, handlers);
}

// School-admin assistant — streamed, grounded in the school's live data.
export function streamAdminAI(
  payload: { message: string; history?: AIChatTurn[] },
  handlers: StreamHandlers
): Promise<void> {
  return streamSSE("/api/ai/admin/chat/stream", payload, handlers);
}

// Asks the school-admin assistant to author a narrative report from the school's
// live data and downloads it as a Word (.docx) file. One auth-refresh retry.
export async function downloadSchoolAIReport(retried = false): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/ai/admin/report`, {
    method: "POST",
    credentials: "include",
  });
  if (res.status === 401 && !retried) {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return downloadSchoolAIReport(true);
  }
  if (!res.ok) throw new Error("Could not generate the report.");

  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const filename = m ? decodeURIComponent(m[1]) : "IM-Telligence AI Report.docx";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function listReports() {
  return apiFetch<Report[]>("/api/reports");
}

export function requestReport(payload: {
  title: string;
  scope: "global" | "school";
  schoolId?: string;
}) {
  return apiFetch<Report>("/api/reports", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Generates a Word (.docx) report on the server and downloads it. Scoped by
// role: school-admins get their school; super-admins get global or one school.
export async function downloadReport(
  variant: "school" | "super",
  schoolId?: string,
  retried = false
): Promise<void> {
  const path =
    variant === "school"
      ? "/api/reports/school/download"
      : `/api/reports/super/download${schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ""}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  if (res.status === 401 && !retried) {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return downloadReport(variant, schoolId, true);
  }
  if (!res.ok) throw new Error("Could not generate the report.");

  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = cd.match(/filename\*=UTF-8''([^;]+)/);
  const filename = match ? decodeURIComponent(match[1]) : "IM-Telligence Report.docx";

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

type ApiSecurityLog = Omit<SecurityLog, "location" | "role"> & {
  role: Role | null;
  locationLabel: string;
};

function toSecurityLog(log: ApiSecurityLog): SecurityLog {
  return {
    ...log,
    role: log.role ?? "teacher",
    location: { lat: 0, lng: 0, label: log.locationLabel },
  };
}

export async function listSecurityLogs() {
  const logs = await apiFetch<ApiSecurityLog[]>("/api/security-logs");
  return logs.map(toSecurityLog);
}

export type SuperAdminOverview = {
  schoolCount: number;
  teacherCount: number;
  lessonCount: number;
  pendingCount: number;
  pendingApprovals: User[];
  securityAlerts: SecurityLog[];
};

export async function getSuperAdminOverview(): Promise<SuperAdminOverview> {
  const data = await apiFetch<
    Omit<SuperAdminOverview, "securityAlerts"> & {
      securityAlerts: ApiSecurityLog[];
    }
  >("/api/dashboard/super-admin");
  return { ...data, securityAlerts: data.securityAlerts.map(toSecurityLog) };
}

export function listUploadedFiles() {
  return apiFetch<UploadedFile[]>("/api/files");
}

export type UploadResult = {
  file: UploadedFile;
  lessonId: string | null;
  lessonTitle: string | null;
  grade: string | null;
  language: string | null;
  assignedCount: number;
  teacherNames: string[];
  note: string | null;
};

export async function uploadFile(
  file: File,
  language: "en" | "fr",
  retried = false
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);
  const response = await fetch(`${API_BASE_URL}/api/files`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (response.status === 401 && !retried) {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return uploadFile(file, language, true);
  }

  return parseResponse<UploadResult>(response);
}

export function fileDownloadUrl(fileId: string): string {
  return `${API_BASE_URL}/api/files/${fileId}/download`;
}

// Fetches the raw PDF bytes (with the auth cookie + one refresh retry) so the
// in-app PDF.js viewer can render them — no browser download UI involved.
export async function fetchLessonPdf(
  fileId: string,
  retried = false
): Promise<ArrayBuffer> {
  const res = await fetch(fileDownloadUrl(fileId), { credentials: "include" });
  if (res.status === 401 && !retried) {
    const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (refreshed.ok) return fetchLessonPdf(fileId, true);
  }
  if (!res.ok) throw new Error("Could not load the lesson PDF.");
  return res.arrayBuffer();
}

export function linkUploadedFileToLesson(fileId: string, lessonId: string) {
  return apiFetch<UploadedFile>(`/api/files/${fileId}/lesson/${lessonId}`, {
    method: "PATCH",
  });
}

export function deleteUploadedFile(fileId: string) {
  return apiFetch<void>(`/api/files/${fileId}`, {
    method: "DELETE",
  });
}
