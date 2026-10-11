export const runtimeConnectionChangedEvent =
  "batchplane:runtime-connection-changed";

export function notifyRuntimeConnectionChanged(): void {
  window.dispatchEvent(new Event(runtimeConnectionChangedEvent));
}
