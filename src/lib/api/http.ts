import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { isDatabaseUnreachable } from "@/lib/db/availability";

/**
 * The shared shape of every API response, and the error handling that keeps
 * status codes honest. Routes stay tiny because this is where the cross-cutting
 * concerns live — validation failures, not-found, and the database being down
 * each map to the right HTTP status in one place rather than per route.
 *
 * Success:  { "data": ..., "meta": {...}? }
 * Failure:  { "error": { "code": "...", "message": "...", "details"?: ... } }
 */

export function ok<T>(data: T, meta?: Record<string, unknown>): NextResponse {
  return NextResponse.json(meta ? { data, meta } : { data }, { status: 200 });
}

export function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown
): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/** Thrown by a handler to return 404 without the route knowing about HTTP. */
export class NotFoundError extends Error {}

/**
 * Wraps a route handler so every failure becomes a typed JSON error with the
 * correct status, instead of a 500 with a stack trace:
 *   - bad query params (ZodError)      -> 400 invalid_request
 *   - NotFoundError                    -> 404 not_found
 *   - database unreachable             -> 503 service_unavailable
 *   - anything else                    -> 500 internal_error
 * 503 reuses the same connection-failure detector the pages use, so an outage
 * is a retryable 503 rather than a 500.
 */
export function handle(fn: () => Promise<NextResponse>): () => Promise<NextResponse> {
  return async () => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(400, "invalid_request", "One or more query parameters are invalid.", error.issues);
      }
      if (error instanceof NotFoundError) {
        return fail(404, "not_found", error.message || "Resource not found.");
      }
      if (isDatabaseUnreachable(error)) {
        return fail(503, "service_unavailable", "The data store is temporarily unavailable. Try again shortly.");
      }
      console.error("[api] unhandled:", error);
      return fail(500, "internal_error", "Something went wrong handling the request.");
    }
  };
}

/** Validates search params against a schema, throwing ZodError (→ 400) on failure. */
export function parseQuery<T>(schema: ZodSchema<T>, searchParams: URLSearchParams): T {
  return schema.parse(Object.fromEntries(searchParams));
}
