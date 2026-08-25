export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Beirut",
    });
  } catch {
    return iso;
  }
}

export function formatDateOnly(iso?: string) {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "Asia/Beirut",
    });
  } catch {
    return iso;
  }
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Both chat surfaces render raw text — the assistant is told never to use
// Markdown, but providers slip **bold** and ## headings in anyway. Strip the
// syntax at render time so a teacher never reads asterisks off a projector.
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")           // **bold**
    .replace(/__/g, "")             // __bold__
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // ## headings
    .replace(/^\s{0,3}\*\s+/gm, "- ")   // * bullets -> plain dashes
    .replace(/^\s*```.*$/gm, "");   // ``` fences (the code itself stays)
}
