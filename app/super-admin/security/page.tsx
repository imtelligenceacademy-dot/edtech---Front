"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { SecurityLogTable } from "@/components/security/SecurityLogTable";
import { listSecurityLogs } from "@/lib/api";
import type { SecurityLog } from "@/types";

export default function SuperAdminSecurityPage() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSecurityLogs()
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <>
      <PageHeader
        title="Security Logs"
        subtitle="All sign-in events across schools."
      />
      <SecurityLogTable logs={logs} />
    </>
  );
}
