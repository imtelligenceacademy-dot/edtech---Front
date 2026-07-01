"use client";

import { useEffect, useState } from "react";
import { School, Users, BookOpen, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/DashboardShell";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { getSuperAdminOverview, type SuperAdminOverview } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function SuperAdminDashboard() {
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSuperAdminOverview()
      .then(setOverview)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load dashboard.")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (error || !overview) {
    return (
      <>
        <PageHeader
          title="Overview"
          subtitle="Platform-wide health, accounts, and activity."
        />
        <Card>
          <CardBody>
            <p className="text-sm text-slate-500">
              {error ?? "No data available."}
            </p>
          </CardBody>
        </Card>
      </>
    );
  }

  const pending = overview.pendingApprovals;
  const recentSecurity = overview.securityAlerts;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Platform-wide health, accounts, and activity."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Schools" value={overview.schoolCount} icon={<School size={18} />} />
        <StatCard label="Teachers" value={overview.teacherCount} icon={<Users size={18} />} />
        <StatCard label="Lessons" value={overview.lessonCount} icon={<BookOpen size={18} />} />
        <StatCard
          label="Pending approvals"
          value={overview.pendingCount}
          icon={<ShieldAlert size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Pending signup approvals" subtitle="Review and decide." />
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Requested</TH>
              </TR>
            </THead>
            <tbody>
              {pending.map((u) => (
                <TR key={u.id}>
                  <TD>
                    <div className="font-medium text-slate-900">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </TD>
                  <TD className="capitalize">{u.role.replace("-", " ")}</TD>
                  <TD className="text-xs">{formatDate(u.createdAt)}</TD>
                </TR>
              ))}
              {pending.length === 0 && (
                <TR>
                  <TD className="text-center text-slate-500" >No pending approvals.</TD>
                </TR>
              )}
            </tbody>
          </Table>
        </Card>

        <Card>
          <CardHeader
            title="Security alerts"
            subtitle="Warnings and blocked events across all schools."
          />
          <CardBody className="!p-0">
            <Table>
              <THead>
                <TR>
                  <TH>User</TH>
                  <TH>Event</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <tbody>
                {recentSecurity.map((l) => (
                  <TR key={l.id}>
                    <TD className="font-medium text-slate-900">{l.userName}</TD>
                    <TD className="text-xs">{l.event.replace(/-/g, " ")}</TD>
                    <TD>
                      <Badge tone={l.status === "blocked" ? "danger" : "warning"}>
                        {l.status}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
