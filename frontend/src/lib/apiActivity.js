import { useSyncExternalStore } from "react";

/*
 * How many API requests are in flight. api.js counts every request up and down;
 * the top loading bar subscribes with useApiBusy().
 */
let pending = 0;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

export function requestStarted() {
  pending += 1;
  if (pending === 1) emit();
}

export function requestFinished() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) emit();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** true while at least one API request is running. */
export function useApiBusy() {
  return useSyncExternalStore(subscribe, () => pending > 0, () => false);
}
