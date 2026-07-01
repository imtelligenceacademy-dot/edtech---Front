"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import {
  createSchool as createSchoolApi,
  deleteSchool as deleteSchoolApi,
  listSchools,
  updateSchool as updateSchoolApi,
} from "@/lib/api";
import { formatDateOnly } from "@/lib/utils";
import type { School } from "@/types";

type Draft = { name: string; city: string; country: string };
const emptyDraft: Draft = { name: "", city: "", country: "Lebanon" };

export default function SchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);

  // null = closed; "new" = creating; a School = editing that school.
  const [editing, setEditing] = useState<School | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<School | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSchools()
      .then(setSchools)
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setError(null);
    setDraft(emptyDraft);
    setEditing("new");
  }

  function openEdit(school: School) {
    setError(null);
    setDraft({ name: school.name, city: school.city, country: school.country });
    setEditing(school);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      city: draft.city.trim(),
      country: draft.country.trim(),
    };
    try {
      if (editing === "new") {
        const created = await createSchoolApi(payload);
        setSchools((current) => [created, ...current]);
      } else if (editing) {
        const updated = await updateSchoolApi(editing.id, payload);
        setSchools((current) =>
          current.map((s) => (s.id === updated.id ? updated : s))
        );
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save school.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setError(null);
    setSaving(true);
    try {
      await deleteSchoolApi(deleting.id);
      setSchools((current) => current.filter((s) => s.id !== deleting.id));
      setDeleting(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete school.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <>
      <PageHeader
        title="Schools"
        subtitle="All schools using IM-Telligence."
        actions={
          <Button onClick={openCreate}>
            <Plus size={14} /> New school
          </Button>
        }
      />
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>School</TH>
              <TH>Location</TH>
              <TH>Teachers</TH>
              <TH>Admins</TH>
              <TH>Created</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <tbody>
            {schools.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium text-slate-900">{s.name}</TD>
                <TD>
                  {s.city}, {s.country}
                </TD>
                <TD>{s.teacherCount}</TD>
                <TD>{s.adminCount}</TD>
                <TD>{formatDateOnly(s.createdAt)}</TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(s)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      aria-label={`Edit ${s.name}`}
                      title="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setError(null);
                        setDeleting(s);
                      }}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete ${s.name}`}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </TD>
              </TR>
            ))}
            {schools.length === 0 && (
              <TR>
                <TD className="text-center text-slate-500">No schools yet.</TD>
              </TR>
            )}
          </tbody>
        </Table>
      </Card>

      {/* Create / edit */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Create school" : "Edit school"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="school-form" disabled={saving}>
              {saving
                ? "Saving…"
                : editing === "new"
                ? "Create school"
                : "Save changes"}
            </Button>
          </>
        }
      >
        <form id="school-form" onSubmit={save} className="space-y-3">
          <label className="block text-xs font-medium text-slate-700">
            School name
            <input
              required
              value={draft.name}
              onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-700">
              City
              <input
                required
                value={draft.city}
                onChange={(e) => setDraft((v) => ({ ...v, city: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Country
              <input
                required
                value={draft.country}
                onChange={(e) => setDraft((v) => ({ ...v, country: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete school"
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
          Are you sure you want to delete{" "}
          <span className="font-medium text-slate-900">{deleting?.name}</span>?
          This cannot be undone.
        </p>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </Modal>
    </>
  );
}
