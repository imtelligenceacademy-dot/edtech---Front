"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import type { Session } from "@/types";
import { logout } from "@/lib/api";
import { initials } from "@/lib/utils";

export function Topbar({
  session,
  onOpenNavigation,
}: {
  session: Session;
  onOpenNavigation: () => void;
}) {
  const router = useRouter();

  async function handleSignOut() {
    await logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenNavigation}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-xs font-medium leading-tight text-slate-900">{session.name}</p>
          <p className="text-[11px] capitalize leading-tight text-slate-500">
            {session.role.replace("-", " ")}
          </p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
          {initials(session.name)}
        </div>
        <button
          onClick={handleSignOut}
          className="p-1 text-slate-400 hover:text-slate-700"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
