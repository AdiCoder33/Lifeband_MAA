// Supabase client for report uploads
import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_PROJECT_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_PROJECT_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase URL or anon key is not set. File uploads will fail.');
}

export const supabase = createClient(SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY);
