"use client";

import { useEffect } from "react";

// Last-resort boundary: catches errors thrown by the root layout itself, which
// `error.tsx` cannot reach. It replaces the whole document, so it renders its
// own <html>/<body> and uses inline styles (globals.css may not be loaded).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          color: "#0f172a",
        }}
      >
        <div style={{ maxWidth: 420, padding: "0 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#475569" }}>
            The application failed to load. Please try again — if it keeps
            happening, let your administrator know.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: 12,
                fontSize: 11,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#94a3b8",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "#fff",
              background: "#0891b2",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
