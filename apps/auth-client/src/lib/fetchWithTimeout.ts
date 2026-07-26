function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return `${err.message} (${cause.name}: ${cause.message})`;
  }
  if (cause && typeof cause === "object" && "code" in cause) {
    return `${err.message} (${String((cause as { code: string }).code)})`;
  }
  return err.message;
}

/** Fetch with AbortSignal timeout — Google/Graph calls must not hang forever. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const wrapped = new Error(`fetch failed: ${formatFetchError(err)}`);
    (wrapped as Error & { cause?: unknown }).cause = err;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

/** One automatic retry for transient network blips. */
export async function fetchWithTimeoutRetry(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init, timeoutMs);
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return fetchWithTimeout(url, init, timeoutMs);
  }
}
