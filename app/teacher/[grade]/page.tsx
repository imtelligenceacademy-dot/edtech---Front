import { redirect } from "next/navigation";
import { Chatbot } from "@/components/ai/Chatbot";
import { parseGradeSegment, TEACHER_HOME } from "@/lib/teacher-routes";

// /teacher/grade-7 — the assistant scoped to one grade. Static sibling routes
// (/teacher/progress, /teacher/ict-fair) win over this dynamic segment, so
// anything reaching here that isn't a grade is a bad URL.
//
// A teacher who takes this grade more than once is shown the class picker here
// instead, and picking one sends them to /teacher/grade-7/<class>. That choice
// belongs to Chatbot because it is the session that says which classes they
// take, and the great majority take one per grade and never see it.
export default function TeacherGradePage({
  params,
}: {
  params: { grade: string };
}) {
  const grade = parseGradeSegment(params.grade);
  if (grade === null) redirect(TEACHER_HOME);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100">
      <Chatbot grade={grade} />
    </div>
  );
}
