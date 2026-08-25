"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSession, homePathFor, rememberedHomePath } from "@/lib/api";

// The landing page doubles as the sign-in page, so a teacher who presses the
// browser's Back button from the assistant lands on the login form and believes
// they were signed out — their session is in fact still valid. This gate sends
// them straight back into the app instead.
//
// The redirect leans on the locally remembered role first: it is instant, and
// it survives a slow or briefly failing /api/auth/me (a cross-site cookie that
// didn't ride along, a cold API). Anyone without a local session falls through
// to the network check, and only a genuinely signed-out visitor sees the form.
export function SignedInGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const remembered = rememberedHomePath();
    if (remembered) {
      // replace(), not push(), so Back doesn't bounce between the two.
      router.replace(remembered);
      return;
    }

    getSession()
      .then((session) => {
        if (!cancelled) router.replace(homePathFor(session.role));
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
