import { DashboardShell } from "@/components/layout/DashboardShell";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell role="super-admin">{children}</DashboardShell>;
}
