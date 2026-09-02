"use client";

import type {
  AccessRequest,
  AITeacherUsageReport,
  ChatThread,
  FairProject,
  FairSection,
  Lesson,
  ProgressEntry,
  Report,
  Role,
  School,
  SecurityLog,
  SecurityLogDetail,
  Session,
  TeacherAccess,
  TeacherLessonAccessRow,
  StoredChatMessage,
  UploadedFile,
  User,
  UserStatus,
} from "@/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type RequestOptions = RequestInit & { skipRefresh?: boolean };
const ACCESS_TOKEN_KEY = "imt_access_token";
// The signed-in role, remembered so the landing page can send someone straight
// back into the app on Back without first waiting on /api/auth/me.
const ROLE_KEY = "imt_role";

function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

function storeAccessToken(token?: string | null) {
  if (typeof window === "undefined" || !token) return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

function clearAccessToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(ROLE_KEY);
}

// The last signed-in role, or null when there's no local session to resume.
export function rememberedHomePath(): string | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  const role = window.localStorage.getItem(ROLE_KEY) as Role | null;
  if (!token || !role) return null;
  return homePathFor(role);
}

function withAuthHeaders(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  const token = getStoredAccessToken();
  if (token && !merged.has("Authorization")) {
    merged.set("Authorization", `Bearer ${token}`);
  }
  return merged;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!refreshed.ok) return false;
  const data = await parseResponse<{ accessToken?: string }>(refreshed);
  storeAccessToken(data?.accessToken);
  return true;
}

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
  if (typeof data?.accessToken === "string") {
    storeAccessToken(data.accessToken);
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
    headers: withAuthHeaders({
      "Content-Type": "application/json",
      ...headers,
    }),
  });

  if (response.status === 401 && !skipRefresh && path !== "/api/auth/refresh") {
    if (await refreshAccessToken()) {
      return apiFetch<T>(path, { ...options, skipRefresh: true });
    }
  }

  // A 401 the refresh couldn't rescue means the stored token is dead. Drop it,
  // or the landing page would keep bouncing the visitor into an app they can no
  // longer talk to instead of showing them the sign-in form.
  if (response.status === 401) clearAccessToken();

  return parseResponse<T>(response);
}

// --- Saving a server file to disk ------------------------------------------ #
// The API is on another origin, so <a download> is ignored and the browser just
// opens the PDF in a tab. Fetching the bytes with the auth cookie and handing
// the browser an object URL is what actually saves the file under its own name.
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function filenameFromResponse(res: Response): string | null {
  const cd = res.headers.get("Content-Disposition") ?? "";
  const encoded = cd.match(/filename\*=UTF-8''([^;]+)/);
  if (encoded) return decodeURIComponent(encoded[1]);
  const plain = cd.match(/filename="?([^";]+)"?/);
  return plain ? plain[1] : null;
}

// --- Database backup (super-admin) ----------------------------------------- #
async function inferBackupFilename(blob: Blob): Promise<string> {
  const prefix = await blob.slice(0, 32).text();
  const ext = prefix.startsWith("SQLite format 3") ? "db" : "json";
  return `im-telligence-backup.${ext}`;
}

export async function downloadDatabase(retried = false): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/admin/db/download`, {
    credentials: "include",
    headers: withAuthHeaders(),
  });
  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return downloadDatabase(true);
  }
  if (!res.ok) throw new Error("Could not generate the backup.");

  const blob = await res.blob();
  saveBlob(blob, filenameFromResponse(res) ?? (await inferBackupFilename(blob)));
}

// Downloads a zip of every stored lesson/ICT-Fair PDF. The DB backup holds only
// metadata and paths, so this is the companion needed for a full restore.
export async function downloadFilesArchive(retried = false): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/admin/db/files-archive`, {
    credentials: "include",
    headers: withAuthHeaders(),
  });
  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return downloadFilesArchive(true);
  }
  if (!res.ok) throw new Error("Could not build the PDF archive.");

  saveBlob(
    await res.blob(),
    filenameFromResponse(res) ?? "im-telligence-lesson-pdfs.zip"
  );
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
    headers: withAuthHeaders(),
    body: form,
  });
  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return restoreDatabase(file, true);
  }
  return parseResponse<{ message: string }>(res);
}

export function homePathFor(role: Role): string {
  switch (role) {
    case "super-admin":
      return "/super-admin/dashboard";
    case "school-admin":
      return "/school-admin/ai";
    case "teacher":
      return "/teacher";
  }
}

export async function login(email: string, password: string): Promise<Session> {
  const session = await apiFetch<Session>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    skipRefresh: true,
  });
  storeAccessToken(session.accessToken);
  try {
    window.localStorage.setItem(ROLE_KEY, session.role);
  } catch {
    /* storage disabled — the session still works, Back just costs a round-trip */
  }
  return session;
}

export async function logout() {
  await apiFetch<{ message: string }>("/api/auth/logout", {
    method: "POST",
    skipRefresh: true,
  }).catch(() => undefined);
  clearAccessToken();
}

export function getSession() {
  return apiFetch<Session>("/api/auth/me");
}

export function listSchools() {
  return apiFetch<School[]>("/api/schools");
}

export function createSchool(
  payload: Pick<School, "name" | "city" | "country"> & { programYear?: number }
) {
  return apiFetch<School>("/api/schools", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSchool(
  schoolId: string,
  payload: Partial<Pick<School, "name" | "city" | "country" | "programYear">>
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
  ictFairAccess?: boolean;
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
    ictFairAccess: boolean;
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

// One lesson. For a teacher the API refuses anything not assigned to them or
// not currently available, so this doubles as the access check for the
// second-screen presenter window.
export function getLesson(lessonId: string) {
  return apiFetch<Lesson>(`/api/lessons/${lessonId}`);
}

// --- Teacher chat history (one thread per lesson) -------------------------- #

// A teacher's own thread for one lesson. `teacherId` is a super-admin extra;
// the API refuses it for anyone else.
export function listChatMessages(lessonId: string, teacherId?: string) {
  const params = new URLSearchParams({ lessonId });
  if (teacherId) params.set("teacherId", teacherId);
  return apiFetch<StoredChatMessage[]>(`/api/chat/messages?${params}`);
}

export function clearChatMessages(lessonId: string) {
  return apiFetch<void>(`/api/chat/messages?lessonId=${encodeURIComponent(lessonId)}`, {
    method: "DELETE",
  });
}

// Every teacher's assistant usage, with the window boundaries the counts were
// taken from. Super-admin only — the API refuses every other role.
export function getTeacherAiUsage() {
  return apiFetch<AITeacherUsageReport>("/api/ai/usage/teachers");
}

export function listChatThreads(teacherId?: string) {
  const query = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : "";
  return apiFetch<ChatThread[]>(`/api/chat/threads${query}`);
}

// Every stored message as JSON Lines. Streamed by the API, so a year of chat is
// never assembled in memory at either end.
export async function downloadChatExport(retried = false): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/chat/export`, {
    credentials: "include",
    headers: withAuthHeaders(),
  });
  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return downloadChatExport(true);
  }
  if (!res.ok) throw new Error("Could not export the chat history.");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "im-telligence-chats.jsonl";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Fully delete a lesson (its PDFs, assignments, progress, access requests).
export function deleteLesson(lessonId: string) {
  return apiFetch<void>(`/api/lessons/${lessonId}`, { method: "DELETE" });
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

// Sets, in one request, exactly which of a school's teachers have this lesson.
// Other schools' assignments are untouched. Prefer this over looping the
// single-teacher calls: it either applies in full or not at all.
export function putLessonAssignments(
  lessonId: string,
  schoolId: string,
  teacherIds: string[]
) {
  return apiFetch<Lesson>(`/api/lessons/${lessonId}/assignments`, {
    method: "PUT",
    body: JSON.stringify({ schoolId, teacherIds }),
  });
}

// The same edit across many lessons at once. Add and remove are separate lists
// rather than a desired set: the selected lessons already have different
// teachers on them, and adding one teacher must not strip the others.
export type BulkAssignmentEdit = {
  schoolId: string;
  lessonIds: string[];
  addTeacherIds?: string[];
  removeTeacherIds?: string[];
};

export type BulkAssignmentPreview = {
  lessons: number;
  adds: number;
  removes: number;
  /** Removals that discard a teacher's existing progress on the lesson. */
  progressLost: number;
  teachersLosingProgress: string[];
};

export type BulkAssignmentResult = {
  lessonsTouched: number;
  assignmentsAdded: number;
  assignmentsRemoved: number;
  lessons: Lesson[];
};

export function previewBulkAssignments(edit: BulkAssignmentEdit) {
  return apiFetch<BulkAssignmentPreview>("/api/lessons/assignments/bulk-preview", {
    method: "POST",
    body: JSON.stringify(edit),
  });
}

export function bulkAssignments(edit: BulkAssignmentEdit) {
  return apiFetch<BulkAssignmentResult>("/api/lessons/assignments/bulk", {
    method: "POST",
    body: JSON.stringify(edit),
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
  fairProjectId?: string | null;
  currentSlide?: number | null;
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
  // Lets the caller stop a reply mid-stream. Aborting rejects with an
  // AbortError, which the caller is expected to treat as a clean stop.
  signal?: AbortSignal;
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
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal: handlers.signal,
  });

  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return streamSSE(path, body, handlers, true);
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
  payload: {
    message: string;
    lessonId?: string | null;
    fairProjectId?: string | null;
    // 1-based slide the teacher is viewing, so the assistant can inspect it.
    currentSlide?: number | null;
    history?: AIChatTurn[];
  },
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

// Asks the assistant to author a narrative report from live data and downloads
// it as a Word (.docx). `admin` is one school, `super` is every school compared.
// One auth-refresh retry.
async function downloadAIReport(
  path: "/api/ai/admin/report" | "/api/ai/super/report",
  fallbackName: string,
  retried = false
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: withAuthHeaders(),
  });
  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return downloadAIReport(path, fallbackName, true);
  }
  if (!res.ok) {
    let detail = "Could not generate the report.";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // Not JSON (or a rate-limit body we can't parse) — keep the generic text.
    }
    throw new Error(detail);
  }
  saveBlob(await res.blob(), filenameFromResponse(res) ?? fallbackName);
}

export function downloadSchoolAIReport(): Promise<void> {
  return downloadAIReport("/api/ai/admin/report", "IM-Telligence AI Report.docx");
}

// The platform report with the narrative the school admin has always had.
export function downloadPlatformAIReport(): Promise<void> {
  return downloadAIReport(
    "/api/ai/super/report",
    "IM-Telligence AI Platform Report.docx"
  );
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

  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: withAuthHeaders(),
  });
  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return downloadReport(variant, schoolId, true);
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

export function listSecurityLogs() {
  return apiFetch<SecurityLog[]>("/api/security-logs");
}

// One event with the context that makes it readable: is this address familiar,
// what else happened around it, and how many sessions the account has open.
export function getSecurityLogDetail(logId: string) {
  return apiFetch<SecurityLogDetail>(`/api/security-logs/${logId}`);
}

export type StalledTeacher = {
  teacherId: string;
  name: string;
  email: string;
  schoolId?: string | null;
  lastActivityAt?: string | null;
  completedCount: number;
};

export type SuperAdminOverview = {
  schoolCount: number;
  teacherCount: number;
  lessonCount: number;
  pendingCount: number;
  pendingApprovals: User[];
  securityAlerts: SecurityLog[];
  // What is waiting on the platform owner. Each list is capped; the count is
  // the true total.
  accessRequests: AccessRequest[];
  accessRequestCount: number;
  stalledTeachers: StalledTeacher[];
  stalledTeacherCount: number;
  unsortedUploads: UploadedFile[];
  unsortedUploadCount: number;
  stalledAfterDays: number;
};

export async function getSuperAdminOverview(): Promise<SuperAdminOverview> {
  const data = await apiFetch<
    Omit<SuperAdminOverview, "securityAlerts"> & {
      securityAlerts: SecurityLog[];
    }
  >("/api/dashboard/super-admin");
  return data;
}

// What a set of filenames would do if uploaded. Nothing is stored — this is
// the same parser and matching rules the real upload uses, asked in advance.
export type UploadPreviewRow = {
  filename: string;
  ok: boolean;
  note?: string | null;
  lessonTitle?: string | null;
  grade?: number | null;
  course?: string | null;
  lessonNo?: number | null;
  existingLesson: boolean;
  teacherNames: string[];
};

export function previewUploads(
  filenames: string[],
  language: "en" | "fr",
  year: 1 | 2
) {
  return apiFetch<UploadPreviewRow[]>("/api/files/preview", {
    method: "POST",
    body: JSON.stringify({ filenames, language, year }),
  });
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
  year: 1 | 2 = 2,
  retried = false
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);
  form.append("year", String(year));
  const response = await fetch(`${API_BASE_URL}/api/files`, {
    method: "POST",
    credentials: "include",
    headers: withAuthHeaders(),
    body: form,
  });

  if (response.status === 401 && !retried) {
    if (await refreshAccessToken()) return uploadFile(file, language, year, true);
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
  const res = await fetch(fileDownloadUrl(fileId), {
    credentials: "include",
    headers: withAuthHeaders(),
  });
  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return fetchLessonPdf(fileId, true);
  }
  if (!res.ok) {
    let detail = "Could not load the lesson PDF.";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // Keep the generic message when the server did not send JSON.
    }
    throw new Error(detail);
  }
  return res.arrayBuffer();
}

// Saves one lesson PDF under its real filename. `View` opens it in a tab; this
// is the one that puts it on the admin's machine.
export async function downloadLessonPdf(
  fileId: string,
  filename: string,
  retried = false
): Promise<void> {
  const res = await fetch(fileDownloadUrl(fileId), {
    credentials: "include",
    headers: withAuthHeaders(),
  });
  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return downloadLessonPdf(fileId, filename, true);
  }
  if (!res.ok) throw new Error("Could not download that PDF.");
  saveBlob(await res.blob(), filenameFromResponse(res) ?? filename);
}

// Zips a whole selection server-side — a grade, a language, or hand-picked rows
// — instead of the admin saving each PDF by hand.
export async function downloadFileSelection(
  fileIds: string[],
  label?: string,
  retried = false
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/files/archive`, {
    method: "POST",
    credentials: "include",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ fileIds, label }),
  });
  if (res.status === 401 && !retried) {
    if (await refreshAccessToken()) return downloadFileSelection(fileIds, label, true);
  }
  if (!res.ok) {
    let detail = "Could not build the download.";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // Server didn't send JSON — keep the generic message.
    }
    throw new Error(detail);
  }
  saveBlob(await res.blob(), filenameFromResponse(res) ?? "im-telligence-lessons.zip");
}

// What a selection would destroy, counted before the admin confirms it.
export type DeletionImpact = {
  files: number;
  lessons: number;
  teachers: number;
  assignments: number;
  progress: number;
  chatMessages: number;
  accessRequests: number;
  lessonsInProgress: number;
  lessonTitles: string[];
  missing: number;
};

export function fileDeletionImpact(fileIds: string[]) {
  return apiFetch<DeletionImpact>("/api/files/deletion-impact", {
    method: "POST",
    body: JSON.stringify({ fileIds }),
  });
}

export function bulkDeleteFiles(fileIds: string[]) {
  return apiFetch<{ deletedFiles: number; deletedLessons: number }>(
    "/api/files/bulk-delete",
    { method: "POST", body: JSON.stringify({ fileIds }) }
  );
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

// --- ICT Fair projects ----------------------------------------------------- #
// Sections, with their projects nested. A super-admin passes a schoolId to work
// on one school; for everyone else the server scopes to their own regardless.
export function listFairSections(schoolId?: string) {
  const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : "";
  return apiFetch<FairSection[]>(`/api/fair/sections${query}`);
}

export function createFairSection(payload: {
  schoolId: string;
  title: string;
  blurb?: string | null;
  grades: string[];
}) {
  return apiFetch<FairSection>("/api/fair/sections", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFairSection(
  sectionId: string,
  payload: { title?: string; blurb?: string | null; grades?: string[] }
) {
  return apiFetch<FairSection>(`/api/fair/sections/${sectionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** Refused with a 409 while the section still holds projects. */
export function deleteFairSection(sectionId: string) {
  return apiFetch<void>(`/api/fair/sections/${sectionId}`, { method: "DELETE" });
}

/** Projects with no section — uploaded before sections existed, or moved out. */
export function listUnfiledFairProjects() {
  return apiFetch<FairProject[]>("/api/fair/unfiled");
}

/** Rename a project, or move it between sections. Passing `sectionId: null`
 *  takes it out of its section; omitting the field leaves it where it is. */
export function updateFairProject(
  projectId: string,
  payload: { title?: string; sectionId?: string | null }
) {
  return apiFetch<FairProject>(`/api/fair/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function uploadFairProject(
  file: File,
  sectionId?: string | null,
  retried = false
): Promise<FairProject> {
  const form = new FormData();
  form.append("file", file);
  if (sectionId) form.append("section_id", sectionId);
  const response = await fetch(`${API_BASE_URL}/api/fair`, {
    method: "POST",
    credentials: "include",
    headers: withAuthHeaders(),
    body: form,
  });
  if (response.status === 401 && !retried) {
    if (await refreshAccessToken()) return uploadFairProject(file, sectionId, true);
  }
  return parseResponse<FairProject>(response);
}

export function deleteFairProject(projectId: string) {
  return apiFetch<void>(`/api/fair/${projectId}`, { method: "DELETE" });
}
