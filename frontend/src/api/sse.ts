/** Manual SSE client for POST /api/chat/stream. The browser's native `EventSource` only
 * supports GET requests and can't attach an Authorization header, and the chat endpoint is a
 * POST with a JSON body and a bearer token — so this reads the response body as a stream and
 * parses the `event:`/`data:` framing by hand. sse-starlette terminates lines with `\r\n` (the
 * SSE spec's canonical line ending) and separates events with a blank `\r\n\r\n` — normalized
 * to `\n` here before splitting, since line endings are the one thing worth not assuming.
 * Every event payload already carries its own `type` field (see api/types.ts), so this only
 * needs the `data:` line, not the `event:` line.
 */
import { useAuthStore } from "../store/authStore";

export async function streamSSE<T extends { type: string }>(
  path: string,
  body: unknown,
  onEvent: (event: T) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = useAuthStore.getState().token;
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { method: "POST", headers, body: JSON.stringify(body), signal });

  if (!res.ok || !res.body) {
    let detail = res.statusText;
    try {
      const errBody = await res.json();
      detail = errBody.detail ?? detail;
    } catch {
      // Response had no JSON body — fall back to statusText.
    }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      const dataLine = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");

      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine) as T);
      } catch {
        // A malformed chunk shouldn't kill the whole stream — skip it.
      }
    }
  }
}

/** Same manual parsing as `streamSSE`, for GET /api/agents/live (Control Room's always-on feed).
 * Native `EventSource` can't attach the bearer header, so this is a GET sibling of `streamSSE`
 * rather than a method option on it — that stream's payloads have no `type` field of their own
 * (the event name lives in the `event:` line, which this endpoint doesn't need since it only
 * ever sends one event type), so the generic shape differs enough to keep this separate. */
export async function streamGetSSE<T>(path: string, onEvent: (event: T) => void, signal: AbortSignal): Promise<void> {
  const token = useAuthStore.getState().token;
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`/api${path}`, { method: "GET", headers, signal });
  if (!res.ok || !res.body) throw new Error(res.statusText);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);

      const dataLine = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");

      if (!dataLine) continue;
      try {
        onEvent(JSON.parse(dataLine) as T);
      } catch {
        // skip malformed chunk
      }
    }
  }
}
