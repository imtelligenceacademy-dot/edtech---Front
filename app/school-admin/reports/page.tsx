import { redirect } from "next/navigation";

// Reports are something a school admin asks the assistant for, not a place
// they go. Kept as a redirect so existing bookmarks still land somewhere real.
export default function SchoolAdminReportsPage() {
  redirect("/school-admin/ai");
}
