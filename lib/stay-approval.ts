import { sendApprovalCredentialsEmail } from "./approval-email";
import { createAdminSupabaseClient } from "./supabase";
import type { AppUser, ApprovalCredentials, Home, Hommie } from "./types";

type AdminSupabase = ReturnType<typeof createAdminSupabaseClient>;
type StayKind = "home" | "hommie";
type StayRecord = Home | Hommie;

function generateTemporaryPassword(length = 14): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length }, () =>
    alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  ).join("");
}

async function findExistingUserByEmail(
  supabase: AdminSupabase,
  email: string
): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as AppUser | null) ?? null;
}

async function findExistingAuthUserIdByEmail(
  supabase: AdminSupabase,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    throw error;
  }

  return (
    data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ??
    null
  );
}

async function ensurePublicUser(
  supabase: AdminSupabase,
  user: AppUser
): Promise<void> {
  const { error } = await supabase.from("users").upsert({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    city: user.city,
    state: user.state,
    about: user.about,
    avatar_url: user.avatar_url,
    role: user.role,
    onboarding_completed: user.onboarding_completed
  } as never);

  if (error) {
    throw error;
  }
}

export async function provisionStayPartnerAccount(params: {
  supabase: AdminSupabase;
  email: string;
  name: string;
  phone: string | null;
  city: string;
  state: string;
  description: string | null;
  kind: StayKind;
  listingId: string;
  listingLabel: string;
}): Promise<ApprovalCredentials> {
  const existingUser = await findExistingUserByEmail(params.supabase, params.email);
  const existingAuthUserId = await findExistingAuthUserIdByEmail(
    params.supabase,
    params.email
  );

  let userId = existingUser?.id ?? "";
  let generatedPassword: string | null = null;
  let accountCreated = false;

  if (!existingUser && existingAuthUserId) {
    userId = existingAuthUserId;
  } else if (!existingUser) {
    generatedPassword = generateTemporaryPassword();
    const { data, error } = await params.supabase.auth.admin.createUser({
      email: params.email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: {
        role: "stay_host",
        source: "famlo-stay-approval",
        stay_type: params.kind
      }
    });

    if (error || !data.user) {
      throw error ?? new Error("Unable to create stay host account.");
    }

    userId = data.user.id;
    accountCreated = true;
  } else {
    userId = existingUser.id;
  }

  await ensurePublicUser(params.supabase, {
    id: userId,
    name: params.name,
    email: params.email,
    phone: params.phone,
    city: params.city,
    state: params.state,
    about: params.description,
    avatar_url: null,
    role: "stay_host",
    onboarding_completed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  return {
    email: params.email,
    user_id: userId,
    password: generatedPassword,
    account_created: accountCreated,
    profile_type: params.kind,
    profile_id: params.listingId,
    profile_code: params.listingLabel,
    email_sent: false,
    email_provider: null,
    email_error: null
  };
}

export async function sendStayApprovalEmail(params: {
  recipientName: string;
  recipientEmail: string;
  kind: StayKind;
  credentials: ApprovalCredentials;
}): Promise<ApprovalCredentials> {
  try {
    const emailResult = await sendApprovalCredentialsEmail({
      recipientName: params.recipientName,
      recipientEmail: params.recipientEmail,
      applicationType: params.kind,
      credentials: params.credentials
    });

    return {
      ...params.credentials,
      email_sent: emailResult.sent,
      email_provider: emailResult.provider,
      email_error: emailResult.error ?? null
    };
  } catch (error) {
    return {
      ...params.credentials,
      email_sent: false,
      email_provider: null,
      email_error:
        error instanceof Error ? error.message : "Approval email could not be sent."
    };
  }
}

export function getStayProvisioningErrorMessage(error: unknown): string {
  const baseMessage =
    error instanceof Error ? error.message : "Unable to provision stay host account.";
  const normalizedMessage = baseMessage.toLowerCase();

  if (normalizedMessage.includes("user already registered")) {
    return "This email already exists in Supabase Auth. Please check whether the stay host already has a login.";
  }

  if (normalizedMessage.includes("database error creating new user")) {
    return "Supabase Auth could not create the stay host login. Please check your Auth trigger/function and service role key.";
  }

  if (
    normalizedMessage.includes("invalid api key") ||
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("forbidden")
  ) {
    return "Supabase rejected the stay host account request. Please verify SUPABASE_SERVICE_ROLE_KEY and restart the website.";
  }

  return baseMessage;
}

