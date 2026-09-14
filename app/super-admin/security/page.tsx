"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { LoadError } from "@/components/ui/LoadError";
import { SecurityLogTable } from "@/components/security/SecurityLogTable";
import { listSecurityLogs } from "@/lib/api";
import type { SecurityLog } from "@/types";

export default function SuperAdminSecurityPage() {
  const [logs, setLogs] = useState<SecurityLog[]>([]);
  const [loading, setLoading] = useState(true);
  // "No security events." is a claim worth getting right: somebody reading
  // this during an incident needs to know the difference between nothing
  // happened and we could not ask.
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listSecurityLogs()
      .then(setLogs)
      .catch((err) =>
        setLoadError(
          err instanceof Error
            ? err.message
            : "Couldn't load the security log. Check your connection and try again."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return null;

  return (
    <>
      <PageHeader
        title="Security Logs"
        subtitle="All sign-in events across schools."
      />
      {loadError ? (
        <LoadError message={loadError} onRetry={load} />
      ) : (
        <SecurityLogTable logs={logs} />
      )}
    </>
  );
}
