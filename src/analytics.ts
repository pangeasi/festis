type UmamiEventData = Record<string, boolean | number | string | null | undefined>;

type UmamiTracker = {
  track: (eventName: string, data?: UmamiEventData) => void;
};

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export function trackEvent(eventName: string, data?: UmamiEventData) {
  if (typeof window === 'undefined' || !window.umami) return;

  try {
    window.umami.track(eventName, data);
  } catch {
    // Analytics should never interrupt the user flow.
  }
}
