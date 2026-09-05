import { Chatbot } from "@/components/ai/Chatbot";

// The grade gate: no grade is chosen yet, so the assistant is not usable.
// h-dvh, not h-screen: on a phone 100vh is the height with the browser chrome
// hidden, so with overflow-hidden the bottom of the assistant — the composer and
// its send button — sits below the visible area with no way to scroll to it.
export default function TeacherHomePage() {
  return (
    <div className="h-dvh w-screen overflow-hidden bg-slate-100">
      <Chatbot />
    </div>
  );
}
