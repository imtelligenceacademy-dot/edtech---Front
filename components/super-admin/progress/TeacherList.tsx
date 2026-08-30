"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProgressMeter } from "./ProgressMeter";
import type { TeacherProgress } from "@/lib/super-admin/progress";

// The left rail: every teacher, flat, always visible.
//
// No tree, no expanding, no school folders. The school is written on the row
// where it is useful and offered as a filter for when there are more of them
// than fit on a screen - but it never becomes a container you have to open to
// find someone. Typing a name is faster than any amount of clicking, so the
// search box is the first thing in the column and matches every word in any
// order, against name, email, school and grades alike.

export function TeacherList({
  teachers,
  schools,
  selectedId,
  query,
  schoolId,
  onQuery,
  onSchool,
  onSelect,
}: {
  teachers: TeacherProgress[];
  schools: { id: string; name: string }[];
  selectedId: string | null;
  query: string;
  schoolId: string;
  onQuery: (value: string) => void;
  onSchool: (value: string) => void;
  onSelect: (teacher: TeacherProgress) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-slate-100 px-4 py-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search teachers, schools, grades…"
            aria-label="Search teachers"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
          />
        </div>
        <select
          value={schoolId}
          onChange={(e) => onSchool(e.target.value)}
          aria-label="Filter by school"
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30"
        >
          <option value="">All schools</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {teachers.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No teacher matches that.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {teachers.map((teacher) => {
              const active = teacher.id === selectedId;
              return (
                <li key={teacher.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(teacher)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors",
                      active
                        ? "bg-brand-50/70 ring-1 ring-inset ring-brand-100"
                        : "hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <p
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm font-medium",
                          active ? "text-brand-700" : "text-slate-900"
                        )}
                      >
                        {teacher.name}
                      </p>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">
                        {teacher.finished}/{teacher.assigned}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {teacher.schoolName}
                      {teacher.grades.length > 0 ? ` · ${teacher.grades.join(", ")}` : ""}
                    </p>
                    <ProgressMeter
                      className="mt-2"
                      finished={teacher.finished}
                      inProgress={teacher.inProgress}
                      notStarted={teacher.notStarted}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
