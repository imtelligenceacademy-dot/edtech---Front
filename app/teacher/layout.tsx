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
  if (pathname?.startsWith("/teacher/ai")) {
    return <>{children}</>;
  }
  return <DashboardShell role="teacher">{children}</DashboardShell>;
}
