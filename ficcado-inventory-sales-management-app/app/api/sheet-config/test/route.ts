/**
 * app/api/sheet-config/test/route.ts
 * Deprecated per Part 8 refactor. Use /api/sheet-config/global with action: 'check' instead.
 */

export const dynamic = 'force-dynamic';

export async function POST() {
  return Response.json(
    {
      error: 'This per-module test endpoint has been deprecated per Part 8 refactor. Use /api/sheet-config/global instead.',
    },
    { status: 410 }
  );
}
