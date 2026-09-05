import { Chatbot } from "@/components/ai/Chatbot";

// ICT Fair projects — view-only, outside the lesson/unlock pipeline, so it has
// no grade of its own.
// h-dvh, not h-screen: on a phone 100vh is the height with the browser chrome
// hidden, so with overflow-hidden the bottom of the assistant — the composer and
// its send button — sits below the visible area with no way to scroll to it.
export default function TeacherFairPage() {
  return (
    <div className="h-dvh w-screen overflow-hidden bg-slate-100">
      <Chatbot fair />
    </div>
  );
}
