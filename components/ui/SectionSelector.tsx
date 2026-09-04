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
 */
export function SectionSelector({
  grades,
  value,
  onChange,
}: {
  /** The grades currently assigned to this teacher. */
  grades: string[];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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

              {labels.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-brand bg-brand-50 py-1 pl-2.5 pr-1 text-xs font-medium text-brand-700"
                >
                  {label}
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
              ))}

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
            </p>
          </div>
        );
      })}
    </div>
  );
}
