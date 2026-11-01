export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}
