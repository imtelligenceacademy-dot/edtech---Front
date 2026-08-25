"use client";

import { useEffect, useState } from "react";
import { Download, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
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

  useEffect(() => {
    listUsers()
      .then((rows) => setTeachers(rows.filter((u) => u.role === "teacher")))
      .catch(() => setTeachers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setOpenThread(null);
    setMessages([]);
    if (!teacherId) {
      setThreads([]);
      return;
    }
    listChatThreads(teacherId).then(setThreads).catch(() => setThreads([]));
  }, [teacherId]);

  function openLessonThread(thread: ChatThread) {
    setOpenThread(thread);
    setMessages([]);
    listChatMessages(thread.lessonId, teacherId)
      .then(setMessages)
      .catch(() => setMessages([]));
  }

  async function exportAll() {
    setExporting(true);
    try {
      await downloadChatExport();
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
              {threads.length === 0 ? (
                <p className="text-sm text-slate-500">
                  This teacher hasn&apos;t asked the assistant anything yet.
                </p>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.lessonId}
                    onClick={() => openLessonThread(thread)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                      openThread?.lessonId === thread.lessonId
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
              title={openThread?.lessonTitle ?? "Transcript"}
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
                <p className="text-sm text-slate-500">Loading…</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
