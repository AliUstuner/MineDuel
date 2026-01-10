import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Validate environment variables
if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[SUPABASE] Missing environment variables!');
    console.error('SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
    console.error('SUPABASE_SERVICE_KEY:', supabaseServiceKey ? 'SET' : 'MISSING');
}

// Client for frontend (limited access) - only create if keys exist
export const supabase = supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Admin client for server-side operations
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

export default supabase;
