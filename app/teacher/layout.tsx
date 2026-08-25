"use client";

import { usePathname } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The AI Assistant takes over the whole viewport — no sidebar, no topbar.
  // Everything under /teacher is the assistant except the progress page.
  if (!pathname?.startsWith("/teacher/progress")) {
    return <>{children}</>;
  }
  return <DashboardShell role="teacher">{children}</DashboardShell>;
}
