"use client";

import { useEffect, useState } from "react";
import { Check, Plus, X, Ban, Pencil, Trash2, ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { GradeSelector } from "@/components/ui/GradeSelector";
import {
  createUser as createUserApi,
  deleteUser as deleteUserApi,
  listSchools,
  listUsers,
  resetUserPassword,
  updateUser as updateUserApi,
  updateUserStatus,
} from "@/lib/api";
import { gradeLabel } from "@/lib/grades";
import type { School, User, UserStatus } from "@/types";
import { cn } from "@/lib/utils";

const statusTone: Record<UserStatus, Parameters<typeof Badge>[0]["tone"]> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  rejected: "muted",
};

type Lang = "en" | "fr" | "both";

type Draft = {
  name: string;
  email: string;
  password: string;
  role: User["role"];
  schoolId: string;
  grades: string[];
  language: Lang;
};

const blankDraft: Draft = {
  name: "",
  email: "",
  password: "Password123!",
  role: "teacher",
  schoolId: "",
  grades: [],
  language: "en",
};

const LANG_LABEL: Record<Lang, string> = {
  en: "English",
  fr: "French",
  both: "Bilingual",
};

function gradesSummary(grades?: string[]): string {
  if (!grades || grades.length === 0) return "No grades";
  if (grades.length > 6) return `${grades.length} grades`;
  return grades.map(gradeLabel).join(", ");
}

export default function AccountsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "suspended">("all");
  const [loading, setLoading] = useState(true);

  // null = closed, "new" = create, User = edit that user.
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [step, setStep] = useState<"details" | "grades">("details");
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [deleting, setDeleting] = useState<User | null>(null);

  useEffect(() => {
    Promise.all([listUsers(), listSchools()])
      .then(([userRows, schoolRows]) => {
        setUsers(userRows);
        setSchools(schoolRows);
      })
      .finally(() => setLoading(false));
  }, []);

  async function update(id: string, status: UserStatus) {
    const user = await updateUserStatus(id, status);
    setUsers((prev) => prev.map((u) => (u.id === id ? user : u)));
  }

  function openCreate() {
    setError(null);
    setStep("details");
    setDraft({ ...blankDraft, schoolId: schools[0]?.id ?? "" });
    setEditing("new");
  }

  function openEdit(u: User) {
    setError(null);
    setStep("details");
    setDraft({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      schoolId: u.schoolId ?? schools[0]?.id ?? "",
      grades: u.grades ?? [],
      language: (u.language ?? "en") as Lang,
    });
    setEditing(u);
  }

  function closeModal() {
    setEditing(null);
    setStep("details");
    setShowPassword(false);
  }

  async function persist() {
    setError(null);
    setSaving(true);
    const isTeacher = draft.role === "teacher";
    const schoolId = draft.role === "super-admin" ? null : draft.schoolId || null;
    try {
      if (editing === "new") {
        const user = await createUserApi({
          name: draft.name.trim(),
          email: draft.email.trim().toLowerCase(),
          password: draft.password,
          role: draft.role,
          schoolId: schoolId ?? undefined,
          grades: isTeacher ? draft.grades : [],
          language: isTeacher ? draft.language : undefined,
        });
        setUsers((prev) => [user, ...prev]);
        setFilter("all");
      } else if (editing) {
        const user = await updateUserApi(editing.id, {
          name: draft.name.trim(),
          email: draft.email.trim().toLowerCase(),
          role: draft.role,
          schoolId,
          grades: isTeacher ? draft.grades : [],
          language: isTeacher ? draft.language : undefined,
        });
        if (draft.password.trim()) {
          await resetUserPassword(editing.id, draft.password);
        }
        setUsers((prev) => prev.map((u) => (u.id === user.id ? user : u)));
      }
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save user.");
    } finally {
      setSaving(false);
    }
  }

  // Primary action for the create/edit modal.
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Creating a teacher: details → grades step before persisting.
    if (editing === "new" && draft.role === "teacher" && step === "details") {
      setError(null);
      setStep("grades");
      return;
    }
    await persist();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setError(null);
    setSaving(true);
    try {
      await deleteUserApi(deleting.id);
      setUsers((prev) => prev.filter((u) => u.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete user.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = users.filter((u) => (filter === "all" ? true : u.status === filter));

  const tabs: { key: typeof filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: users.length },
    { key: "pending", label: "Pending", count: users.filter((u) => u.status === "pending").length },
    { key: "active", label: "Active", count: users.filter((u) => u.status === "active").length },
    { key: "suspended", label: "Suspended", count: users.filter((u) => u.status === "suspended").length },
  ];

  if (loading) return null;

  const isNew = editing === "new";
  const isTeacher = draft.role === "teacher";
  const onGradesStep = isNew && isTeacher && step === "grades";

  const modalTitle = isNew
    ? onGradesStep
      ? "Assign grades"
      : "Create user"
    : "Edit user";

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Approve signups, manage admins and teachers."
        actions={
          <Button onClick={openCreate}>
            <Plus size={14} /> New user
          </Button>
        }
      />

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 mb-4 text-xs">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "px-3 py-1.5 rounded-md font-medium",
              filter === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
            )}
          >
            {t.label} <span className="opacity-60">· {t.count}</span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title="Users" subtitle={`${filtered.length} shown`} />
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH>Role</TH>
              <TH>School</TH>
              <TH>Grades</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <tbody>
            {filtered.map((u) => {
              const school = schools.find((s) => s.id === u.schoolId);
              return (
                <TR key={u.id}>
                  <TD>
                    <div className="font-medium text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </TD>
                  <TD className="capitalize">{u.role.replace("-", " ")}</TD>
                  <TD>{school?.name ?? "—"}</TD>
                  <TD>
                    {u.role === "teacher" ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-slate-600">
                          {gradesSummary(u.grades)}
                        </span>
                        {u.language && (
                          <Badge
                            tone={u.language === "both" ? "brand" : "info"}
                            className="w-fit"
                          >
                            {LANG_LABEL[u.language as Lang]}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={statusTone[u.status]} className="capitalize">
                      {u.status}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {u.status === "pending" && (
                        <>
                          <Button size="sm" onClick={() => update(u.id, "active")}>
                            <Check size={12} /> Approve
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => update(u.id, "rejected")}>
                            <X size={12} /> Reject
                          </Button>
                        </>
                      )}
                      {u.status === "active" && (
                        <Button size="sm" variant="secondary" onClick={() => update(u.id, "suspended")}>
                          <Ban size={12} /> Suspend
                        </Button>
                      )}
                      {u.status === "suspended" && (
                        <Button size="sm" onClick={() => update(u.id, "active")}>
                          <Check size={12} /> Reinstate
                        </Button>
                      )}
                      <button
                        onClick={() => openEdit(u)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        aria-label={`Edit ${u.name}`}
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => {
                          setError(null);
                          setDeleting(u);
                        }}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${u.name}`}
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {/* Create / edit */}
      <Modal
        open={editing !== null}
        onClose={closeModal}
        title={modalTitle}
        footer={
          onGradesStep ? (
            <>
              <Button variant="secondary" onClick={() => setStep("details")}>
                <ArrowLeft size={13} /> Back
              </Button>
              <Button type="submit" form="user-form" disabled={saving}>
                {saving ? "Creating…" : "Create teacher"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" form="user-form" disabled={saving}>
                {isNew && isTeacher ? (
                  <>
                    Next: assign grades <ArrowRight size={13} />
                  </>
                ) : saving ? (
                  "Saving…"
                ) : isNew ? (
                  "Create user"
                ) : (
                  "Save changes"
                )}
              </Button>
            </>
          )
        }
      >
        <form id="user-form" onSubmit={onSubmit} className="space-y-3">
          {onGradesStep ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Select every grade{" "}
                <span className="font-medium text-slate-900">
                  {draft.name.trim() || "this teacher"}
                </span>{" "}
                teaches. They can teach a single grade, a range, or all of them.
              </p>
              <GradeSelector
                value={draft.grades}
                onChange={(grades) => setDraft((v) => ({ ...v, grades }))}
              />
            </div>
          ) : (
            <>
              <label className="block text-xs font-medium text-slate-700">
                Full name
                <input
                  required
                  value={draft.name}
                  onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                Email
                <input
                  required
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft((v) => ({ ...v, email: e.target.value }))}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </label>
              <label className="block text-xs font-medium text-slate-700">
                {isNew ? "Temporary password" : "New password"}
                <div className="relative mt-1">
                  <input
                    required={isNew}
                    type={showPassword ? "text" : "password"}
                    minLength={8}
                    value={draft.password}
                    placeholder={isNew ? "" : "Leave blank to keep current"}
                    onChange={(e) => setDraft((v) => ({ ...v, password: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {!isNew && (
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">
                    The current password can&apos;t be shown — it&apos;s stored only as a
                    one-way hash. Type a new one to reset it.
                  </span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-slate-700">
                  Role
                  <select
                    value={draft.role}
                    onChange={(e) =>
                      setDraft((v) => ({ ...v, role: e.target.value as User["role"] }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"
                  >
                    <option value="teacher">Teacher</option>
                    <option value="school-admin">School Admin</option>
                    <option value="super-admin">Super Admin</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-700">
                  School
                  <select
                    value={draft.schoolId}
                    disabled={draft.role === "super-admin"}
                    onChange={(e) => setDraft((v) => ({ ...v, schoolId: e.target.value }))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm disabled:bg-slate-100"
                  >
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Teacher language of instruction — drives which lesson PDFs they get. */}
              {isTeacher && (
                <label className="block text-xs font-medium text-slate-700">
                  Language of instruction
                  <select
                    value={draft.language}
                    onChange={(e) =>
                      setDraft((v) => ({ ...v, language: e.target.value as Lang }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"
                  >
                    <option value="en">English</option>
                    <option value="fr">French</option>
                    <option value="both">Bilingual (English &amp; French)</option>
                  </select>
                  <span className="mt-1 block text-[11px] font-normal text-slate-500">
                    Determines whether this teacher receives English or French lesson PDFs.
                  </span>
                </label>
              )}

              {/* When editing a teacher, grades are edited inline. */}
              {!isNew && isTeacher && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-700">Grades taught</p>
                  <GradeSelector
                    value={draft.grades}
                    onChange={(grades) => setDraft((v) => ({ ...v, grades }))}
                  />
                </div>
              )}
            </>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete user"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={saving}>
              {saving ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Permanently delete{" "}
          <span className="font-medium text-slate-900">{deleting?.name}</span> (
          {deleting?.email})? This removes their account, assignments, and progress.
          This cannot be undone.
        </p>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </Modal>
    </>
  );
}
