"use client";

import { PageHeader } from "@/components/layout/DashboardShell";
import { ReportSection } from "@/components/reports/ReportSection";

export default function SuperAdminReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Global platform reports across all schools."
      />
      <ReportSection scope="global" />
    </>
  );
}
