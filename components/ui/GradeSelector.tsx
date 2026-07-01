"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_GRADE_CODES, GRADE_OPTIONS } from "@/lib/grades";

const PRESETS: { label: string; codes: string[] }[] = [
  { label: "All grades", codes: ALL_GRADE_CODES },
  { label: "Kindergarten", codes: ["KG1", "KG2"] },
  { label: "Grades 1–6", codes: ["G1", "G2", "G3", "G4", "G5", "G6"] },
  { label: "Grades 7–12", codes: ["G7", "G8", "G9", "G10", "G11", "G12"] },
];

export function GradeSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const selected = new Set(value);

  function toggle(code: string) {
    const next = new Set(selected);
    next.has(code) ? next.delete(code) : next.add(code);
    onChange(ALL_GRADE_CODES.filter((c) => next.has(c)));
  }

  return (
    <div className="space-y-4">
      {/* Quick presets */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active =
            p.codes.every((c) => selected.has(c)) &&
            selected.size === p.codes.length;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.codes)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-brand bg-brand text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand-700"
              )}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:border-red-300 hover:text-red-600"
        >
          Clear
        </button>
      </div>

      {/* Grade grid */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {GRADE_OPTIONS.map((g) => {
          const active = selected.has(g.code);
          return (
            <button
              key={g.code}
              type="button"
              onClick={() => toggle(g.code)}
              aria-pressed={active}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-xl border px-2 py-3 text-center transition-all",
                active
                  ? "border-brand bg-brand-50 ring-1 ring-brand shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              {active && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white">
                  <Check size={11} />
                </span>
              )}
              <span
                className={cn(
                  "text-sm font-semibold",
                  active ? "text-brand-700" : "text-slate-800"
                )}
              >
                {g.short}
              </span>
              <span className="mt-0.5 text-[10px] text-slate-400">
                {g.code.startsWith("KG") ? "Kinder" : "Grade"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-500">
        {value.length === 0
          ? "No grades selected yet."
          : `${value.length} grade${value.length === 1 ? "" : "s"} selected.`}
      </p>
    </div>
  );
}
