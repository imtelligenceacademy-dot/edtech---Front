"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { LoadError } from "@/components/ui/LoadError";
import { useLatestOnly } from "@/lib/use-latest-only";
import { Button } from "@/components/ui/Button";
import {
  downloadChatExport,
  listChatMessages,
  listChatThreads,
  listUsers,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { ChatThread, StoredChatMessage, User } from "@/types";

// Teacher conversations, readable by the platform owner only — the API refuses
// every other role, school admins included. Read-only by design: this is for
// seeing what teachers are asking the assistant, not for editing it.
export default function SuperAdminChatsPage() {
  const [teachers, setTeachers] = useState<User[]>([]);
  const [teacherId, setTeacherId] = useState<string>("");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [openThread, setOpenThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<StoredChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listUsers()
      .then((rows) => setTeachers(rows.filter((u) => u.role === "teacher")))
      .catch((err) => {
        // Swallowing this left an empty teacher picker, which reads as a
        // platform with no teachers on it.
        setTeachers([]);
        setLoadError(
          err instanceof Error
            ? err.message
            : "Couldn't load the teachers. Check your connection and try again."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const transcript = useLatestOnly();

  useEffect(() => {
    setOpenThread(null);
    setMessages([]);
    setTranscriptError(null);
    // And abandon any transcript still in flight: clearing the state it would
    // land in is not enough, because it lands afterwards.
    transcript.retire();
    setThreadsError(null);
    // Cleared whichever teacher is now selected, not only when none is. Left
    // standing, one teacher's conversations were listed under another
    // teacher's name for the length of the request — the panel said "4 with
    // chats" while the picker said somebody else — and an admin reading
    // private chat subjects against the wrong person is the whole of the harm.
    setThreads([]);
    if (!teacherId) return;

    let current = true;
    listChatThreads(teacherId)
      .then((rows) => {
        if (current) setThreads(rows);
      })
      .catch((err) => {
        if (!current) return;
        // An empty list here used to read "This teacher hasn't asked the
        // assistant anything yet", which is a claim about the teacher rather
        // than about the request that failed.
        setThreadsError(
          err instanceof Error ? err.message : "Couldn't load this teacher's lessons."
        );
      });
    return () => {
      current = false;
    };
  }, [teacherId, transcript]);

  function openLessonThread(thread: ChatThread) {
    setOpenThread(thread);
    setMessages([]);
    setTranscriptError(null);
    // Whose conversation is on screen is not a detail. The guard above covers
    // the thread *list* only, so a slow transcript could still land under a
    // different thread's heading — or, after switching the picker, under a
    // different teacher's name, which is the harm this page's own comment
    // higher up is written about.
    const mine = transcript.claim();
    listChatMessages(thread.lessonId, thread.section, teacherId)
      .then((rows) => {
        if (mine()) setMessages(rows);
      })
      .catch((err) => {
        if (!mine()) return;
        // Without this the pane's only empty state is "Loading...", so a
        // transcript that failed sat there loading for as long as anyone left
        // it open.
        setTranscriptError(
          err instanceof Error ? err.message : "Couldn't load this conversation."
        );
      });
  }

  async function exportAll() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadChatExport();
    } catch (err) {
      // `downloadChatExport` throws on a non-OK response, and a bare
      // finally let that rejection reach nothing but the browser console.
      // The button went "Exporting..." and back, no file was saved, and
      // the screen said nothing at all — which reads as an export that
      // worked and a browser that lost the file.
      setExportError(
        err instanceof Error ? err.message : "Could not export the chats."
      );
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Teacher chats" subtitle="Conversations with the lesson assistant." />
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Teacher chats"
        subtitle="Conversations with the lesson assistant, one thread per lesson. Visible to you only."
        actions={
          <Button variant="secondary" onClick={exportAll} disabled={exporting}>
            <Download size={14} className="mr-1.5" />
            {exporting ? "Exporting…" : "Export all"}
          </Button>
        }
      />

      {exportError && (
        <p className="mb-4 text-sm text-red-600">{exportError}</p>
      )}

      {loadError && <LoadError message={loadError} onRetry={load} />}

      <Card className="mb-6">
        <CardBody>
          <label className="text-xs font-medium text-slate-700">Teacher</label>
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="mt-1 h-10 w-full max-w-sm rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">Choose a teacher…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.email}
              </option>
            ))}
          </select>
        </CardBody>
      </Card>

      {teacherId && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader title="Lessons" subtitle={`${threads.length} with chats`} />
            <CardBody className="space-y-1.5">
              {threadsError ? (
                <p className="text-sm text-red-600">{threadsError}</p>
              ) : threads.length === 0 ? (
                <p className="text-sm text-slate-500">
                  This teacher hasn&apos;t asked the assistant anything yet.
                </p>
              ) : (
                threads.map((thread) => (
                  <button
                    // A lesson taught to several classes is several threads,
                    // so the class is part of what identifies one.
                    key={`${thread.lessonId}|${thread.section}`}
                    onClick={() => openLessonThread(thread)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                      openThread?.lessonId === thread.lessonId &&
                      openThread?.section === thread.section
                        ? "border-brand/40 bg-brand-50/60"
                        : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <MessageSquare size={13} className="shrink-0 text-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">
                        {thread.lessonTitle ?? thread.lessonId}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {thread.section ? `Class ${thread.section} · ` : ""}
                        {thread.messageCount} messages · {formatDate(thread.lastMessageAt ?? undefined)}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={
                openThread
                  ? (openThread.lessonTitle ?? "Transcript") +
                    (openThread.section ? ` · Class ${openThread.section}` : "")
                  : "Transcript"
              }
              subtitle={openThread ? undefined : "Pick a lesson to read its thread."}
            />
            <CardBody className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg border p-3 text-sm ${
                    m.role === "user"
                      ? "border-slate-200 bg-white"
                      : "border-brand/20 bg-brand-50/40"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    {m.role === "user" ? "Teacher" : "Assistant"} · {formatDate(m.createdAt)}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-slate-800">
                    {m.content}
                  </p>
                </div>
              ))}
              {openThread && messages.length === 0 && (
                transcriptError ? (
                  <p className="text-sm text-red-600">{transcriptError}</p>
                ) : (
                  <p className="text-sm text-slate-500">Loading…</p>
                )
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
