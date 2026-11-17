import { createBrowserClient } from '@supabase/ssr';

// @supabase/ssr throws synchronously if the URL/key are empty, which aborts
// the Next.js production build when those env vars aren't set (CI, local
// typecheck, environments with no secrets configured). Fall back to a
// syntactically valid placeholder so the client can always be constructed;
// it will simply fail auth calls at runtime if actually used unconfigured.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
