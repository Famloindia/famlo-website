import { NextResponse } from "next/server";
import { createGuestSessionToken, getGuestCookieName, getGuestSessionMaxAge } from "@/lib/guest-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";

function normalizePhone(input: string): string {
  const clean = input.replace(/[^\d+]/g, "").trim();
  const withoutPlus = clean.startsWith("+") ? clean.slice(1) : clean;
  const normalized = withoutPlus.startsWith("91") ? withoutPlus : `91${withoutPlus}`;
  if (!/^91\d{10}$/.test(normalized)) {
    throw new Error("Please enter a valid Indian mobile number.");
  }
  return normalized;
}

function stablePhonePassword(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `FamloPhone!${digits}`;
}

function deterministicGuestId(phone: string): string {
  const digest = Buffer.from(phone).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function getJwtRole(token: string | undefined): string | null {
  if (!token) return null;
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown };
    return typeof decoded.role === "string" ? decoded.role : null;
  } catch {
    return null;
  }
}

async function callTwoFactorVerify(url: string): Promise<void> {
  const postResponse = await fetch(url, { method: "POST", cache: "no-store" });
  const postJson = await postResponse.json().catch(() => null);
  if (postResponse.ok && postJson?.Status === "Success") {
    return;
  }

  const getResponse = await fetch(url, { method: "GET", cache: "no-store" });
  const getJson = await getResponse.json().catch(() => null);
  if (getResponse.ok && getJson?.Status === "Success") {
    return;
  }

  throw new Error(postJson?.Details || getJson?.Details || "Invalid OTP");
}

export async function POST(request: Request) {
  try {
    const { type, value, otp, sessionId } = await request.json();

    if (!value || !otp || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    if (type === "email") {
      // Supabase native email OTP verification
      const { data, error } = await supabase.auth.verifyOtp({
        email: value,
        token: otp,
        type: "signup" // Try signup first
      });

      if (error) {
        // Try login type if signup fails
        const { data: loginData, error: loginError } = await supabase.auth.verifyOtp({
          email: value,
          token: otp,
          type: "magiclink"
        });
        if (loginError) throw loginError;
        return NextResponse.json({ success: true, session: loginData.session });
      }

      return NextResponse.json({ success: true, session: data.session });
    }

    if (type === "phone") {
      const cleanPhone = normalizePhone(value);
      const apiKey = process.env.TWO_FACTOR_API_KEY;

      if (!apiKey) {
        console.warn("[OTP Mock] Verifying mock phone OTP");
        if (otp !== "123456") throw new Error("Invalid Mock OTP");
      } else {
        // Verify with 2Factor.in
        const apiUrl = `https://2factor.in/API/V1/${apiKey}/SMS/VERIFY/${sessionId}/${otp}`;
        await callTwoFactorVerify(apiUrl);
      }

      const existingRole = getJwtRole(process.env.SUPABASE_SERVICE_ROLE_KEY);
      let sessionResult: { session: unknown | null; userId: string | null } | null = null;

      if (existingRole === "service_role") {
        try {
          const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          if (listError) throw listError;

          const deterministicPassword = stablePhonePassword(cleanPhone);
          let authUser = authUsers.users.find((user) => user.phone === cleanPhone) ?? null;

          const { data: profile, error: pError } = await supabase
            .from("users")
            .select("id, name, email, onboarding_completed")
            .eq("phone", cleanPhone)
            .maybeSingle();

          if (pError) throw pError;

          let userId = typeof profile?.id === "string" ? profile.id : authUser?.id ?? null;

          if (!authUser) {
            const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
              password: deterministicPassword,
              email_confirm: true,
              phone: cleanPhone,
              phone_confirm: true,
              user_metadata: {
                role: "guest",
                source: "famlo-web-phone-otp",
                phone: cleanPhone,
              },
            });

            if (createError || !createdUser.user) {
              throw new Error(createError?.message ?? "Unable to create phone auth account.");
            }

            authUser = createdUser.user;
            userId = createdUser.user.id;
          } else {
            const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
              password: deterministicPassword,
              phone: cleanPhone,
              user_metadata: {
                ...(authUser.user_metadata ?? {}),
                role: "guest",
                source: "famlo-web-phone-otp",
                phone: cleanPhone,
              },
            });

            if (updateError) {
              throw new Error(updateError.message ?? "Unable to refresh phone login.");
            }
          }

          if (!userId) {
            throw new Error("Unable to resolve phone auth user.");
          }

          const { error: upsertError } = await supabase
            .from("users")
            .upsert({
              id: userId,
              phone: cleanPhone,
              email: profile?.email ?? null,
              name: profile?.name ?? null,
              role: "guest",
              onboarding_completed: Boolean(profile?.onboarding_completed),
              auth_provider: "phone",
              updated_at: new Date().toISOString(),
            } as never, { onConflict: "id" });

          if (upsertError) throw upsertError;

          const response = NextResponse.json({ success: true, customSession: true });
          response.cookies.set(getGuestCookieName(), createGuestSessionToken(userId, cleanPhone), {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: getGuestSessionMaxAge(),
          });
          return response;
        } catch (adminError) {
          console.warn("[auth.otp.verify] admin phone login fallback", adminError);
        }
      }

      if (!sessionResult) {
        const deterministicPassword = stablePhonePassword(cleanPhone);
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          phone: cleanPhone,
          password: deterministicPassword,
        });

        if (!signInError && signInData.session && signInData.user) {
          sessionResult = {
            session: signInData.session,
            userId: signInData.user.id,
          };
        } else {
          const { data: existingProfile, error: profileError } = await supabase
            .from("users")
            .select("id")
            .eq("phone", cleanPhone)
            .maybeSingle();

          if (profileError) {
            console.warn("[auth.otp.verify] guest profile lookup fallback", profileError);
          }

          const userId =
            typeof existingProfile?.id === "string" && existingProfile.id.length > 0
              ? existingProfile.id
              : deterministicGuestId(cleanPhone);

          const response = NextResponse.json({ success: true, customSession: true });
          response.cookies.set(getGuestCookieName(), createGuestSessionToken(userId, cleanPhone), {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: getGuestSessionMaxAge(),
          });
          return response;
        }
      }

      if (!sessionResult?.userId) {
        throw new Error("Unable to finalize phone login.");
      }

      return NextResponse.json({
        success: true,
        session: sessionResult.session,
      });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (error: any) {
    console.error("OTP verification failed:", error);
    return NextResponse.json({ error: error.message || "Invalid OTP" }, { status: 401 });
  }
}
