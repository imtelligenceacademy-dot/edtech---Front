"use client";

import { usePathname } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default function SchoolAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The assistant is the whole screen, not a document sitting in one. The other
  // school-admin pages are reports and tables, which keep the reading-width cap.
  const isAssistant = pathname?.startsWith("/school-admin/ai") ?? false;

  return (
    <DashboardShell role="school-admin" fullBleed={isAssistant}>
      {children}
    </DashboardShell>
  );
}
