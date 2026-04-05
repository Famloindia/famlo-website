import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnvVar(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    assertEnvVar(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    assertEnvVar(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

export function createAdminSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    assertEnvVar(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    assertEnvVar(supabaseServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
