import { createClient } from '@supabase/supabase-js';

let supabase = null;
let supabaseAdmin = null;

try {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

    // Validate and create clients
    if (supabaseUrl && supabaseAnonKey) {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
    
    if (supabaseUrl && supabaseServiceKey) {
        supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    }
} catch (error) {
    console.error('[SUPABASE] Failed to create client:', error.message);
}

export { supabase, supabaseAdmin };
export default supabase;
