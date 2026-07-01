"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { ReportSection } from "@/components/reports/ReportSection";
import { getSession } from "@/lib/api";

export default function SchoolAdminReportsPage() {
  const [s, setS] = useState<{ userId: string; schoolId?: string } | null>(null);
  useEffect(() => {
    getSession().then((sess) => setS({ userId: sess.userId, schoolId: sess.schoolId }));
  }, []);
  if (!s) return null;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Request and download reports for your school."
      />
      <ReportSection scope="school" schoolId={s.schoolId} />
    </>
  );
}
