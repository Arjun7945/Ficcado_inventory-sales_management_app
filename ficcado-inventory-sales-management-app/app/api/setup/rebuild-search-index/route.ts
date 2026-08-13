/**
 * app/api/setup/rebuild-search-index/route.ts
 *
 * POST /api/setup/rebuild-search-index
 *
 * Admin Control Centre action: rebuilds the search index for one or all
 * searchable modules from scratch. Use after bulk imports or initial setup.
 *
 * Body: { moduleKey?: SearchableModule } — if omitted, rebuilds all.
 */

import { requireAuth } from '@/lib/auth';
import { buildSearchIndex, DEFAULT_KEY_EXTRACTORS, SearchableModule } from '@/lib/google/searchIndex';

export const dynamic = 'force-dynamic';

const ALL_SEARCHABLE: SearchableModule[] = ['sales', 'inventory', 'items', 'customer_info'];

export async function POST(request: Request) {
  try { await requireAuth(); }
  catch (e) { if (e instanceof Response) return e; return Response.json({ error: 'Authentication required.' }, { status: 401 }); }

  try {
    const body = await request.json().catch(() => ({}));
    const targetModule: SearchableModule | undefined = body.moduleKey;

    const modulesToProcess = targetModule
      ? (ALL_SEARCHABLE.includes(targetModule) ? [targetModule] : [])
      : ALL_SEARCHABLE;

    if (modulesToProcess.length === 0) {
      return Response.json({ error: `Unknown or non-searchable module: ${targetModule}` }, { status: 400 });
    }

    const results: Record<string, number> = {};
    for (const mod of modulesToProcess) {
      const { indexedCount } = await buildSearchIndex(mod, DEFAULT_KEY_EXTRACTORS[mod]);
      results[mod] = indexedCount;
    }

    const total = Object.values(results).reduce((a, b) => a + b, 0);
    return Response.json({
      success: true,
      message: `Search index rebuilt. ${total} entries indexed.`,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: 'Index rebuild failed.', detail: message }, { status: 500 });
  }
}
