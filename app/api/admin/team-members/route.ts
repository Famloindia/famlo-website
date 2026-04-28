import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminCookieName, verifyAdminSessionToken } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

function generateTemporaryPassword(length = 14): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length }, () => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join("");
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();
    const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };

    const name = normalizeName(body.name);
    const email = normalizeEmail(body.email);
    const password = normalizeName(body.password) || generateTemporaryPassword();

    if (!name || !email) {
      return NextResponse.json({ error: "name and email are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id, role")
      .eq("email", email)
      .maybeSingle();
    if (profileError) throw profileError;

    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;

    const existingAuthUser = authUsers.users.find((user) => user.email?.toLowerCase() === email) ?? null;
    const profileRole = String((profile as { role?: unknown } | null)?.role ?? "").toLowerCase();
    const authRole = String(existingAuthUser?.user_metadata?.role ?? existingAuthUser?.app_metadata?.role ?? "").toLowerCase();

    if ((profileRole && profileRole !== "team") || (authRole && authRole !== "team")) {
      return NextResponse.json({ error: "This email already belongs to a non-team account." }, { status: 409 });
    }

    let authUserId = existingAuthUser?.id ?? null;
    let generated = !normalizeName(body.password);

    if (existingAuthUser) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(existingAuthUser.user_metadata ?? {}),
          role: "team",
          name,
          source: "famlo-web-admin-team-members",
        },
      });

      if (updateError) {
        throw updateError;
      }
    } else {
      const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: "team",
          name,
          source: "famlo-web-admin-team-members",
        },
      });

      if (createError || !createdUser.user) {
        throw new Error(createError?.message ?? "Unable to create team auth account.");
      }

      authUserId = createdUser.user.id;
    }

    if (!authUserId) {
      return NextResponse.json({ error: "Could not resolve team user account." }, { status: 500 });
    }

    const now = new Date().toISOString();
    const { error: upsertError } = await supabase
      .from("users")
      .upsert(
        {
          id: authUserId,
          name,
          email,
          role: "team",
          updated_at: now,
        } as never,
        { onConflict: "id" }
      );

    if (upsertError) throw upsertError;

    return NextResponse.json({
      success: true,
      teamMember: {
        id: authUserId,
        name,
        email,
      },
      credentials: {
        email,
        password,
        generated,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create or update the team member.",
      },
      { status: 500 }
    );
  }
}
