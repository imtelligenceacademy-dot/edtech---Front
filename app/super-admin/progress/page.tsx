"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TeacherDetail } from "@/components/super-admin/progress/TeacherDetail";
import { TeacherList } from "@/components/super-admin/progress/TeacherList";
import { MeterLegend } from "@/components/super-admin/progress/ProgressMeter";
import {
  buildProgress,
  matchesTeacher,
  totals,
  type ProgressFilter,
  type TeacherProgress,
} from "@/lib/super-admin/progress";
import { listLessons, listProgress, listSchools, listUsers } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Lesson, ProgressEntry, School, User } from "@/types";

// Where every teacher on the platform has got to.
//
// Two panes, each scrolling on its own, so the page itself never scrolls and
// the list of teachers stays put while you read one of them. That is also the
// shape the shell can actually support: DashboardShell sets overflow-hidden on
// its root, which breaks position:sticky, so internal scroll is how the Files
// and Access pages hold a column in place too.
//
// There is nothing here about being late. A lesson is finished, in progress,
// or not started, and the page reports position rather than passing judgement.

function Skeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="h-[520px] rounded-xl bg-slate-100 lg:col-span-4" />
      <div className="h-[520px] rounded-xl bg-slate-100 lg:col-span-8" />
    </div>
  );
}

export default function SuperAdminProgressPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProgressFilter>("all");
  // Set when the phone user taps "All teachers". Without it the effect
  // below would re-select them instantly and the back button would look
  // broken.
  const [browsing, setBrowsing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [userRows, lessonRows, progressRows, schoolRows] = await Promise.all([
        listUsers(),
        listLessons(),
        listProgress(),
        listSchools(),
      ]);
      setUsers(userRows);
      setLessons(lessonRows);
      setProgress(progressRows);
      setSchools(schoolRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load teacher progress.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teachers = useMemo(
    () => buildProgress(users, lessons, progress, schools),
    [users, lessons, progress, schools]
  );

  const shown = useMemo(
    () =>
      teachers
        .filter((t) => (schoolId ? t.schoolId === schoolId : true))
        .filter((t) => matchesTeacher(t, query)),
    [teachers, schoolId, query]
  );

  // Land on someone rather than on an empty pane, and never leave a selection
  // pointing at a teacher the current filter has hidden.
  useEffect(() => {
    if (browsing || shown.length === 0) return;
    if (!selectedId || !shown.some((t) => t.id === selectedId)) {
      setSelectedId(shown[0].id);
    }
  }, [shown, selectedId, browsing]);

  const selected: TeacherProgress | null =
    shown.find((t) => t.id === selectedId) ?? null;
  const sum = useMemo(() => totals(shown), [shown]);

  return (
    <>
      <PageHeader
        title="Progress"
        subtitle="Where each teacher has got to — what they have finished and what is still ahead."
        actions={
          !loading && sum.teachers > 0 ? (
            <div className="hidden items-baseline gap-3 sm:flex">
              <span className="text-sm text-slate-500">
                <span className="font-semibold tabular-nums text-slate-900">
                  {sum.finished}
                </span>{" "}
                of {sum.assigned} lessons finished across {sum.teachers} teacher
                {sum.teachers === 1 ? "" : "s"}
              </span>
            </div>
          ) : undefined
        }
      />

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50/60">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <p className="flex-1 text-sm text-red-700">{error}</p>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Skeleton />
      ) : teachers.length === 0 ? (
        <Card>
          <p className="px-5 py-16 text-center text-sm text-slate-500">
            No teachers yet. Once accounts exist, their progress shows up here.
          </p>
        </Card>
      ) : (
        <>
          <MeterLegend
            className="mb-3 sm:hidden"
            finished={sum.finished}
            inProgress={sum.inProgress}
            notStarted={sum.notStarted}
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* On phones the rail steps aside once a teacher is open, so one
                screen is never trying to be two. */}
            <Card
              className={cn(
                "h-[calc(100vh-13rem)] min-h-[420px] overflow-hidden lg:col-span-4",
                selected ? "hidden lg:block" : "block"
              )}
            >
              <TeacherList
                teachers={shown}
                schools={schools}
                selectedId={selectedId}
                query={query}
                schoolId={schoolId}
                onQuery={setQuery}
                onSchool={setSchoolId}
                onSelect={(t) => {
                  setSelectedId(t.id);
                  setBrowsing(false);
                  setFilter("all");
                }}
              />
            </Card>

            <Card
              className={cn(
                "h-[calc(100vh-13rem)] min-h-[420px] overflow-hidden lg:col-span-8",
                selected ? "block" : "hidden lg:block"
              )}
            >
              {selected ? (
                <TeacherDetail
                  teacher={selected}
                  filter={filter}
                  onFilter={setFilter}
                  onBack={() => {
                    setSelectedId(null);
                    setBrowsing(true);
                  }}
                />
              ) : (
                <p className="flex h-full items-center justify-center px-5 text-center text-sm text-slate-500">
                  Pick a teacher to see where they have got to.
                </p>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
