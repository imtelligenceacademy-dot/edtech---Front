"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GRADE_OPTIONS } from "@/lib/grades";

// A super-admin's limit, matching the server's. Generous — it exists to stop a
// typo becoming a thousand progress rows, not to express a real limit.
const MAX_PER_GRADE = 12;
const MAX_LABEL = 16;

/**
 * Names the classes a teacher takes for each grade.
 *
 * Only needed when one teacher takes the same grade more than once — 6A, 6B,
 * 6C. Naming them gives each class its own progress, its own place in the
 * lesson sequence and its own unlock countdown, so finishing a lesson with one
 * class leaves it open for the others.
 *
 * A grade left empty is the normal case and stays the default: one class, and
 * the teacher is never shown a class anywhere in the product.
 *
 * A class can be renamed by clicking its name. That is reported separately from
 * the resulting list, because a list on its own cannot say whether "A" became
 * "Red" or was deleted and replaced — and those mean opposite things for
 * everything recorded in that room.
 */
export function SectionSelector({
  grades,
  value,
  onChange,
  onRename,
}: {
  /** The grades currently assigned to this teacher. */
  grades: string[];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  /** Told when a class is renamed rather than replaced. */
  onRename?: (grade: string, from: string, to: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // The class whose name is being edited, and the text so far.
  const [editing, setEditing] = useState<{ grade: string; label: string } | null>(
    null
  );
  const [editText, setEditText] = useState("");

  function labelsFor(code: string): string[] {
    return value[code] ?? [];
  }

  function setLabels(code: string, labels: string[]) {
    const next = { ...value };
    if (labels.length === 0) delete next[code];
    else next[code] = labels;
    onChange(next);
  }

  function add(code: string) {
    const text = (drafts[code] ?? "").trim().slice(0, MAX_LABEL);
    const existing = labelsFor(code);
    setDrafts((d) => ({ ...d, [code]: "" }));
    if (!text || existing.length >= MAX_PER_GRADE) return;
    // Case-insensitive: "a" and "A" are the same class, however it was typed.
    if (existing.some((l) => l.toLowerCase() === text.toLowerCase())) return;
    setLabels(code, [...existing, text]);
  }

  function startEditing(code: string, label: string) {
    setEditing({ grade: code, label });
    setEditText(label);
  }

  function commitEdit() {
    if (!editing) return;
    const { grade: code, label: from } = editing;
    const to = editText.trim().slice(0, MAX_LABEL);
    setEditing(null);
    setEditText("");
    if (!to || to === from) return;
    // Renaming onto a class that already exists would merge two rooms, so it is
    // refused here rather than half-applied on the server.
    if (labelsFor(code).some((l) => l !== from && l.toLowerCase() === to.toLowerCase())) {
      return;
    }
    // Replaced in place: the order classes are listed in decides which one a
    // teacher's existing progress belongs to.
    setLabels(
      code,
      labelsFor(code).map((l) => (l === from ? to : l))
    );
    onRename?.(code, from, to);
  }

  if (grades.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Assign a grade first, then you can name its classes.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {grades.map((code) => {
        const labels = labelsFor(code);
        const option = GRADE_OPTIONS.find((g) => g.code === code);
        const full = labels.length >= MAX_PER_GRADE;
        return (
          <div
            key={code}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-semibold text-slate-800">
                {option?.label ?? code}
              </span>

              {labels.map((label) => {
                const isEditing =
                  editing?.grade === code && editing?.label === label;
                return (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full border border-brand bg-brand-50 py-1 pl-2.5 pr-1 text-xs font-medium text-brand-700"
                  >
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditing(null);
                            setEditText("");
                          }
                        }}
                        onBlur={commitEdit}
                        maxLength={MAX_LABEL}
                        aria-label={`Rename class ${label}`}
                        className="w-16 bg-transparent text-xs font-medium text-brand-700 focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditing(code, label)}
                        title="Rename this class"
                        aria-label={`Rename class ${label}`}
                        // Negative margins pull the padding back out again, so
                        // the target covers the whole chip label without moving
                        // anything: a single letter is otherwise about eight
                        // pixels wide and easy to miss.
                        className="-my-1 -mx-1 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-brand"
                      >
                        {label}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setLabels(code, labels.filter((l) => l !== label))
                      }
                      aria-label={`Remove class ${label}`}
                      className="flex h-4 w-4 items-center justify-center rounded-full text-brand-700 transition hover:bg-brand hover:text-white"
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}

              <input
                value={drafts[code] ?? ""}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [code]: e.target.value }))
                }
                // Enter adds a class rather than submitting the account form —
                // naming four classes should not save the account three times.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add(code);
                  }
                }}
                onBlur={() => add(code)}
                maxLength={MAX_LABEL}
                disabled={full}
                placeholder={labels.length === 0 ? "e.g. A" : "Add"}
                aria-label={`Add a class to ${option?.label ?? code}`}
                className="h-7 w-20 rounded-full border border-dashed border-slate-300 px-2.5 text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-slate-50"
              />
              {!full && (
                <button
                  type="button"
                  onClick={() => add(code)}
                  aria-label={`Add class to ${option?.label ?? code}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-brand hover:text-brand-700"
                >
                  <Plus size={12} />
                </button>
              )}
            </div>

            <p
              className={cn(
                "mt-1.5 text-[11px]",
                labels.length > 1 ? "text-slate-500" : "text-slate-400"
              )}
            >
              {labels.length === 0
                ? "One class — nothing to name."
                : labels.length === 1
                ? "One class. Add another only if this teacher takes this grade more than once."
                : `${labels.length} classes, each with its own progress.`}
              {labels.length > 0 && " Click a class to rename it."}
            </p>
          </div>
        );
      })}
    </div>
  );
}
