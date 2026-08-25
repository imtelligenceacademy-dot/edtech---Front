"use client";

// Talk between the teacher's window and the window projected on the second
// screen. Both are same-origin pages of this app, so a BroadcastChannel is
// enough — no server round-trip, and it keeps working if the popup loses its
// window.opener reference.
//
// The teacher's window owns the page number and every write; the projected
// window only renders what it is told.

export type PresentMessage =
  | { type: "hello" } // projector: I'm here, what page are we on?
  | { type: "ready"; total: number } // projector: PDF loaded, it has N pages
  | { type: "page"; page: number } // teacher: show this page
  | { type: "stop" } // teacher: close yourself
  | { type: "bye" }; // projector: I was closed

export type PresentChannel = {
  post: (message: PresentMessage) => void;
  close: () => void;
};

export function presentChannelName(lessonId: string): string {
  return `imt-present-${lessonId}`;
}

// Opens the channel for one lesson. `onMessage` never sees the messages this
// same window posted — BroadcastChannel doesn't echo to the sender.
export function openPresentChannel(
  lessonId: string,
  onMessage: (message: PresentMessage) => void
): PresentChannel {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return { post: () => {}, close: () => {} };
  }

  const channel = new BroadcastChannel(presentChannelName(lessonId));
  channel.onmessage = (event: MessageEvent<PresentMessage>) => {
    if (event.data && typeof event.data.type === "string") onMessage(event.data);
  };

  return {
    post: (message) => {
      try {
        channel.postMessage(message);
      } catch {
        /* the channel is already closed — nothing to deliver to */
      }
    },
    close: () => channel.close(),
  };
}
