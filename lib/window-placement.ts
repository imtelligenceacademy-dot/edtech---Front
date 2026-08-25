"use client";

// Open the lesson on the classroom's second display.
//
// The window is opened synchronously inside the click that asked for it —
// anything awaited first spends the user activation and the popup is blocked.
// Placement happens afterwards: where the browser exposes the Window Management
// API (Chrome/Edge desktop, behind a one-time permission prompt) we move the
// window onto the external screen and size it to fill; everywhere else the
// teacher drags it across once.

type ScreenDetailed = {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  isInternal: boolean;
  label: string;
};

type ScreenDetails = {
  screens: ScreenDetailed[];
  currentScreen: ScreenDetailed;
};

export type PresenterWindow = {
  win: Window | null; // null when the popup was blocked
  placed: boolean; // true if we put it on an external screen ourselves
};

export function openPresenterWindow(url: string): PresenterWindow {
  const win = window.open(
    url,
    "imt-present",
    "popup=yes,width=1280,height=800,menubar=no,toolbar=no,location=no,status=no"
  );
  if (!win) return { win: null, placed: false };
  win.focus();
  return { win, placed: false };
}

// Best-effort move onto the external display. Safe to call and ignore: a
// browser without the API, a declined permission or a single-screen laptop all
// just leave the window where it opened.
export async function placeOnExternalScreen(win: Window): Promise<boolean> {
  const getScreenDetails = (
    window as unknown as { getScreenDetails?: () => Promise<ScreenDetails> }
  ).getScreenDetails;
  if (typeof getScreenDetails !== "function") return false;

  try {
    const details = await getScreenDetails.call(window);
    const external =
      details.screens.find((s) => s !== details.currentScreen && !s.isInternal) ??
      details.screens.find((s) => s !== details.currentScreen);
    if (!external || win.closed) return false;

    win.moveTo(external.availLeft, external.availTop);
    win.resizeTo(external.availWidth, external.availHeight);
    return true;
  } catch {
    // Permission declined, or the API threw — the teacher can still drag it.
    return false;
  }
}
