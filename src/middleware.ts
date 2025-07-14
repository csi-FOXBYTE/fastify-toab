export function createMiddleware<
  NewContext extends Record<string, unknown>,
  NextContext extends NewContext,
  Context extends Record<string, unknown> = {}
>(
  fn: (
    opts: { ctx: Context },
    next: (opts: { ctx: NewContext }) => Promise<void>
  ) => Promise<NextContext>
) {
  return fn;
}
