import 'server-only';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (see .env.example).');

// Server-only client. The secret key bypasses row-level security, so it must
// never reach the browser; every table is locked to everyone else.
export const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
