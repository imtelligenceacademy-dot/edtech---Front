import { redirect } from "next/navigation";
import { TEACHER_HOME } from "@/lib/teacher-routes";

// The assistant used to live here; keep old links and bookmarks working.
export default function TeacherAIPage() {
  redirect(TEACHER_HOME);
}
