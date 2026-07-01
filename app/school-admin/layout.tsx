"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";

export default function SchoolAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell role="school-admin">{children}</DashboardShell>;
}
