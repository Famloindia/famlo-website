import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recordRecentEntityViewCompatibility } from "@/lib/recent-views-db";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// ✅ Singleton instances — created once, reused everywhere
let _publicClient: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

export function createPublicSupabaseClient(): SupabaseClient {
  if (_publicClient) return _publicClient;
  _publicClient = createClient(
    requireEnv(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
  return _publicClient;
}

export function createBrowserSupabaseClient(): SupabaseClient {
  return createPublicSupabaseClient();
}

export function createAdminSupabaseClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  _adminClient = createClient(
    requireEnv(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv(supabaseServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  return _adminClient;
}

// ✅ Fixed: correct table name and column names from your schema
export async function recordRecentView(familyId: string) {
  const supabase = createPublicSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  try {
    await recordRecentEntityViewCompatibility({
      supabase,
      userId: user.id,
      entityType: "host",
      entityId: familyId,
      legacyFamilyId: familyId
    });
  } catch (err) {
    console.error("Failed to record recent view:", err);
  }
}
