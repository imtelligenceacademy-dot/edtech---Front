import { Chatbot } from "@/components/ai/Chatbot";

// ICT Fair projects — view-only, outside the lesson/unlock pipeline, so it has
// no grade of its own.
export default function TeacherFairPage() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100">
      <Chatbot fair />
    </div>
  );
}
