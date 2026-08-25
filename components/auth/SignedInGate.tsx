"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSession, homePathFor } from "@/lib/api";

// The landing page doubles as the sign-in page, so a teacher who presses the
// browser's Back button from the assistant lands on the login form and believes
// they were signed out — their session is in fact still valid. This gate checks
// for a live session first and sends them straight back into the app; only a
// genuinely signed-out visitor ever sees the form.
export function SignedInGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session) => {
        if (cancelled) return;
        // replace(), not push(), so Back doesn't bounce between the two.
        router.replace(homePathFor(session.role));
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <span className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
