/**
 * lib/env.ts
 * Helper to safely read environment variables across Node.js runtime and Cloudflare Workers runtime.
 */
export function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  try {
    // Fallback for Cloudflare Workers when process.env is not automatically populated
    const { getCloudflareContext } = require('@opennextjs/cloudflare');
    const ctx = getCloudflareContext();
    if (ctx?.env && typeof ctx.env === 'object' && key in ctx.env) {
      const val = (ctx.env as Record<string, any>)[key];
      return typeof val === 'string' ? val : undefined;
    }
  } catch {
    // Context unavailable or running outside worker request
  }
  return undefined;
}
