import { API_URL, ApiError, refreshSession } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

type Options = { method?: "GET" | "POST"; body?: unknown };

async function open(path: string, options: Options, signal: AbortSignal): Promise<Response> {
  const send = () =>
    fetch(`${API_URL}/api${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      signal,
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}`,
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  let res = await send();
  if (res.status === 401) {
    await refreshSession();
    res = await send();
  }
  return res;
}

/** Reads Server-Sent Events. Resolves when the server ends the stream; rejects with ApiError or the AbortError. */
export async function streamEvents(
  path: string,
  options: Options,
  signal: AbortSignal,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await open(path, options, signal);
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ApiError("NETWORK_ERROR", "Cannot reach the server. Is the backend running?", 0);
  }
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    throw new ApiError(json?.error?.code ?? "UNKNOWN_ERROR", json?.error?.message ?? "Request failed.", res.status);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) onEvent(event, JSON.parse(data.join("\n")));
    }
  }
}
