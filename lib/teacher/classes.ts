"use client";

import type { ClassSummary } from "@/types";

/**
 * One card per class, from one row per track.
 *
 * Lessons are sequenced per language, so a teacher who delivers both walks two
 * independent tracks through a grade and the server reports one row for each —
 * which is the truth, and what the counts have to be built from. The pickers
 * ask a narrower question ("which class are you teaching?"), so the rows are
 * collapsed back to one card per class here.
 *
 * Merging on the server instead is what produced the fault this replaces: the
 * totals of two curricula were added into one "2 of 6", and "next" was taken
 * from whichever language happened to sort first — so a teacher two-thirds
 * through the English lessons was pointed at French lesson 1.
 */
export function collapseByClass(classes: ClassSummary[]): ClassSummary[] {
  const byClass = new Map<string, ClassSummary[]>();
  for (const row of classes) {
    const key = `${row.grade}|${row.section}`;
    const bucket = byClass.get(key);
    if (bucket) bucket.push(row);
    else byClass.set(key, [row]);
  }

  return Array.from(byClass.values()).map((rows) => {
    if (rows.length === 1) return rows[0];

    // Which track to point at. A teacher is normally part-way through one of
    // them, and that is the one they came back for; failing that, whichever
    // has something open now. Deterministic either way — never "whichever
    // sorted first".
    const started = rows.find((r) => r.lastSlide != null);
    const openNow = rows.find((r) => r.nextStatus === "available");
    const lead = started ?? openNow ?? rows[0];

    return {
      ...lead,
      // Counts span the whole grade, because that is what the teacher has to
      // teach in it, in both languages.
      total: rows.reduce((n, r) => n + r.total, 0),
      completed: rows.reduce((n, r) => n + r.completed, 0),
    };
  });
}
