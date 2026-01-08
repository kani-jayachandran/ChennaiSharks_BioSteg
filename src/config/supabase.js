import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Check if Supabase is properly configured
const isSupabaseConfigured = process.env.SUPABASE_URL && 
  process.env.SUPABASE_URL !== 'https://your-project.supabase.co' &&
  process.env.SUPABASE_ANON_KEY && 
  process.env.SUPABASE_ANON_KEY !== 'your_supabase_anon_key_here' &&
  process.env.SUPABASE_SERVICE_KEY && 
  process.env.SUPABASE_SERVICE_KEY !== 'your_supabase_service_role_key_here';

let supabase = null;
let supabaseAdmin = null;

if (isSupabaseConfigured) {
  try {
    // Create Supabase client for public operations
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: false
        }
      }
    );

    // Create Supabase admin client for server-side operations
    supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log('✅ Supabase clients initialized');
  } catch (error) {
    console.warn('⚠️  Supabase initialization failed:', error.message);
    console.log('🔧 Running in demo mode without Supabase');
  }
} else {
  console.log('🔧 Supabase not configured, running in demo mode');
  console.log('💡 To enable Supabase, update your .env file with real credentials');
}

// Export clients (may be null in demo mode)
export { supabase, supabaseAdmin };

// Test connection
export const testConnection = async () => {
  if (!supabase || !isSupabaseConfigured) {
    console.log('🔧 Supabase connection test skipped (demo mode)');
    return false;
  }

  try {
    const { data, error } = await supabase.from('documents').select('count').limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 is "relation does not exist"
      throw error;
    }
    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    console.log('🔧 Falling back to demo mode');
    return false;
  }
};