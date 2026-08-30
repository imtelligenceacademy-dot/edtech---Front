import { redirect } from "next/navigation";

// Kept as a redirect rather than deleted: a bookmark that 404s reads as the
// product being broken rather than the page having moved.
export default function SchoolAdminSecurityPage() {
  redirect("/school-admin/ai");
}
