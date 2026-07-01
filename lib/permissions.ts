// Centralised role permissions. The frontend uses these for UI gating only.
// TODO: enforce the same matrix on the server.

import type { Role } from "@/types";

export type Capability =
  | "approve-accounts"
  | "create-users"
  | "suspend-users"
  | "upload-files"
  | "assign-files"
  | "view-all-schools"
  | "view-own-school-teachers"
  | "request-reports"
  | "export-reports"
  | "view-global-security"
  | "view-school-security"
  | "view-assigned-lessons"
  | "use-ai-assistant";

const matrix: Record<Role, Capability[]> = {
  "super-admin": [
    "approve-accounts",
    "create-users",
    "suspend-users",
    "upload-files",
    "assign-files",
    "view-all-schools",
    "view-own-school-teachers",
    "request-reports",
    "export-reports",
    "view-global-security",
    "view-school-security",
  ],
  "school-admin": [
    // Monitoring-only. No approvals, no uploads, no user creation, no assignments.
    "view-own-school-teachers",
    "request-reports",
    "export-reports",
    "view-school-security",
  ],
  teacher: ["view-assigned-lessons", "use-ai-assistant"],
};

export function can(role: Role, cap: Capability): boolean {
  return matrix[role].includes(cap);
}
