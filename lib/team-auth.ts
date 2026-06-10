import { createAdminSupabaseClient } from "@/lib/supabase";
import { getSupabaseAccessTokenCookieName } from "./auth-constants";
import { cookies } from "next/headers";

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: "team" | "admin";
}

/**
 * Verify a team member session server-side.
 * Returns the team member if valid, null if unauthorized.
 */
export async function verifyTeamSession(): Promise<TeamMember | null> {
  const cookieStore = await cookies();

  const token = cookieStore.get(getSupabaseAccessTokenCookieName())?.value;
  if (token) {
    try {
      const supabase = createAdminSupabaseClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        const metadataRole = String(user.user_metadata?.role ?? user.app_metadata?.role ?? "").toLowerCase();
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("name, role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        const databaseRole = String((profile as { role?: unknown } | null)?.role ?? "").toLowerCase();
        const isTeamMember = metadataRole === "team" || databaseRole === "team";

        if (isTeamMember) {
          return {
            id: user.id,
            email: user.email ?? "",
            name:
              (profile as { name?: unknown } | null)?.name && typeof (profile as { name?: unknown } | null)?.name === "string"
                ? String((profile as { name?: unknown } | null)?.name)
                : user.user_metadata?.name ?? user.email ?? "Team Member",
            role: "team",
          };
        }
      }
    } catch { /* ignore and move to fallback */ }
  }

  return null;
}

/**
 * Mask sensitive PII fields for team members.
 * Admins receive full data; team members see masked versions.
 */
export function maskForTeam<T extends Record<string, unknown>>(
  data: T,
  role: "team" | "admin"
): T {
  if (role === "admin") return data;

  const masked = { ...data } as any;

  // Mask Aadhaar: show only last 4 digits
  if (typeof (masked as any).aadhar_number === "string") {
    masked.aadhar_number = "XXXX-XXXX-" + (masked as any).aadhar_number.slice(-4);
  }
  // Mask full bank account
  if (typeof (masked as any).bank_account === "string") {
    masked.bank_account = "XXXXXXXX" + (masked as any).bank_account.slice(-4);
  }
  // Hide UPI entirely from team
  if ("upi_id" in (masked as any)) {
    masked.upi_id = "Hidden";
  }
  // Hide commission override from team
  if ("commission_rate_override" in (masked as any)) {
    delete (masked as any).commission_rate_override;
  }

  return masked;
}

/**
 * Get signed URL for a document stored in Supabase Storage.
 * Never exposes raw storage paths in the browser URL.
 */
export async function getSignedDocumentUrl(
  storagePath: string,
  expiresInSeconds = 300
): Promise<string | null> {
  try {
    const supabase = createAdminSupabaseClient();
    const [bucket, ...pathParts] = storagePath.replace("storage://", "").split("/");
    const filePath = pathParts.join("/");

    const { data, error } = await supabase.storage
      .from(bucket || "documents")
      .createSignedUrl(filePath, expiresInSeconds);

    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
