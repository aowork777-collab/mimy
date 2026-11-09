declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    SUPABASE_URL?: string;
    LEGACY_SITES_MIGRATION?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
