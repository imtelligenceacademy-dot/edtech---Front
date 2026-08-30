import { redirect } from "next/navigation";

// The assistant is the whole of the school-admin experience. Everything under
// /school-admin lands here.
export default function Index() {
  redirect("/school-admin/ai");
}
