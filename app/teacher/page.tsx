import { Chatbot } from "@/components/ai/Chatbot";

// The grade gate: no grade is chosen yet, so the assistant is not usable.
export default function TeacherHomePage() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100">
      <Chatbot />
    </div>
  );
}
