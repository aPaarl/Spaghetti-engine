// Runs the Auto Arrange layout engine off the main thread, so the map stays
// responsive while a large model (up to a few seconds' work) is arranged.
import { runFcmLayout } from "./fcmLayout.js";

self.onmessage = async (event) => {
  const { id, input } = event.data;
  try {
    self.postMessage({ id, ok: true, result: await runFcmLayout(input) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message || err) });
  }
};
