import { SchoolAdminChat } from "@/components/ai/SchoolAdminChat";

export default function SchoolAdminAIPage() {
  // Fill the shell's content area (viewport minus the 56px topbar), edge-to-edge.
  // dvh, not vh: on a phone 100vh is the height with the browser chrome hidden,
  // and the chat inside is overflow-hidden — so the composer at its bottom ends
  // up below the visible area with no way to scroll to it.
  return (
    <div className="h-[calc(100dvh-3.5rem)] -m-4 sm:-m-6 md:-m-8">
      <SchoolAdminChat />
    </div>
  );
}
