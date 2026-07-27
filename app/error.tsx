"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";

// Catches render/runtime errors anywhere in the app. Without this, an unhandled
// error in production shows the user a blank white page with no way to recover.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the browser console and Railway logs for diagnosis.
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle size={26} />
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          The page hit an unexpected error. Trying again usually fixes it — if it
          keeps happening, let your administrator know.
        </p>

        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-slate-400">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            <RotateCw size={14} /> Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <Home size={14} /> Go home
          </a>
        </div>
      </div>
    </div>
  );
}
