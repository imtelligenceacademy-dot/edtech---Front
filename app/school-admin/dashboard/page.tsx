import { redirect } from "next/navigation";

// There is no school-admin dashboard any more - the assistant is the whole
// experience. This stays as a redirect for the same reason as /reports and
// /security: a principal with the old page bookmarked should land somewhere
// that works, not on a 404 that reads as the product being broken.
export default function SchoolAdminDashboardPage() {
  redirect("/school-admin/ai");
}
