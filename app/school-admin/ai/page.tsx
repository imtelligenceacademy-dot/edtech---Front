import { SchoolAdminChat } from "@/components/ai/SchoolAdminChat";

export default function SchoolAdminAIPage() {
  // Fill the shell's content area (viewport minus the 56px topbar), edge-to-edge.
  return (
    <div className="h-[calc(100vh-3.5rem)] -m-4 sm:-m-6 md:-m-8">
      <SchoolAdminChat />
    </div>
  );
}
