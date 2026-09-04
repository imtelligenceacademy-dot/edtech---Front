import { redirect } from "next/navigation";
import { Chatbot } from "@/components/ai/Chatbot";
import { parseGradeSegment, TEACHER_HOME } from "@/lib/teacher-routes";

// /teacher/grade-6/6b — the assistant scoped to one class of one grade.
//
// This segment exists only for a teacher who takes the same grade more than
// once; the class picker at /teacher/grade-6 sends them here. The label is
// checked against the classes they actually take (in Chatbot, which is where
// the session lives), so a stale bookmark or a class an admin has since removed
// returns them to the picker instead of guessing which class they meant.
export default function TeacherClassPage({
  params,
}: {
  params: { grade: string; section: string };
}) {
  const grade = parseGradeSegment(params.grade);
  if (grade === null) redirect(TEACHER_HOME);

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100">
      <Chatbot grade={grade} sectionSegment={params.section} />
    </div>
  );
}
