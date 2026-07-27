import Link from "next/link";
import { Compass, Home } from "lucide-react";

// Shown for any unmatched route (e.g. a stale bookmark or mistyped URL).
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Compass size={26} />
        </div>
        <p className="text-sm font-medium uppercase tracking-widest text-slate-400">
          404
        </p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          That page doesn&apos;t exist, or you may not have access to it.
        </p>

        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            <Home size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
