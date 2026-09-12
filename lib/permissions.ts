// Centralised role permissions. The frontend uses these for UI gating only.
// TODO: enforce the same matrix on the server.

import { isKindergarten } from "@/lib/grades";
import type { Role, User } from "@/types";

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
  | "view-teacher-chats"
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
    "view-teacher-chats",
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

/** True for a teacher whose every grade is a kindergarten one.
 *
 *  A teacher of KG2 and Grade 1 is not one of these — they still teach the
 *  curriculum the assistant is grounded in.
 */
export function teachesOnlyKindergarten(
  user: Pick<User, "grades"> | null | undefined
): boolean {
  const grades = user?.grades ?? [];
  return grades.length > 0 && grades.every(isKindergarten);
}

/** What this particular account may do: the role matrix, then the rules that
 *  depend on the account rather than the role. Mirrors `user_can` on the
 *  server, which is what actually enforces it — this only gates the UI.
 *
 *  The matrix answers first and is only ever narrowed here, so nothing below
 *  can hand someone a capability their role does not carry.
 */
export function userCan(
  user: Pick<User, "role" | "grades"> | null | undefined,
  cap: Capability
): boolean {
  if (!user || !can(user.role, cap)) return false;
  // Kindergarten runs MTiny, which the assistant has no grounding in, so the
  // interface is not offered rather than offered and empty-handed.
  if (cap === "use-ai-assistant" && teachesOnlyKindergarten(user)) return false;
  return true;
}
