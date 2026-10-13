/**
 * lib/env.ts
 * Helper to safely read environment variables across Node.js runtime and Cloudflare Workers runtime.
 * Supports exact matches and handles dashboard-truncated variable names gracefully.
 */
export function getEnv(key: string): string | undefined {
  // 1. Exact match in process.env
  if (typeof process !== 'undefined' && process.env) {
    if (process.env[key]) return process.env[key];

    // Check for truncated or slightly altered variable names (e.g. GOOGLE_SERVICE_ACCOUN)
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === 'string' && v.length > 0) {
        if (k.startsWith(key) || (k.length >= 10 && key.startsWith(k))) {
          return v;
        }
      }
    }
  }

  // 2. Fallback for Cloudflare Workers when process.env is not populated
  try {
    const { getCloudflareContext } = require('@opennextjs/cloudflare');
    const ctx = getCloudflareContext();
    if (ctx?.env && typeof ctx.env === 'object') {
      if (key in ctx.env && typeof (ctx.env as any)[key] === 'string') {
        return (ctx.env as any)[key];
      }

      for (const [k, v] of Object.entries(ctx.env)) {
        if (typeof v === 'string' && v.length > 0) {
          if (k.startsWith(key) || (k.length >= 10 && key.startsWith(k))) {
            return v;
          }
        }
      }
    }
  } catch {
    // Context unavailable or running outside worker request
  }

  return undefined;
}

export function getAllEnvKeys(): string[] {
  const keys = new Set<string>();
  if (typeof process !== 'undefined' && process.env) {
    for (const k of Object.keys(process.env)) {
      if (!k.startsWith('npm_') && !k.startsWith('__') && !k.startsWith('NODE_')) {
        keys.add(k);
      }
    }
  }
  try {
    const { getCloudflareContext } = require('@opennextjs/cloudflare');
    const ctx = getCloudflareContext();
    if (ctx?.env && typeof ctx.env === 'object') {
      for (const k of Object.keys(ctx.env)) {
        keys.add(k);
      }
    }
  } catch {
    // ignore
  }
  return Array.from(keys);
}
