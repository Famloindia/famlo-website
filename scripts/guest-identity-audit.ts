import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  getGuestPhoneLookupVariants,
  mergeGuestProfileCandidates,
  normalizeGuestEmail,
  normalizeGuestPhone,
  pickCanonicalGuestProfile,
  scoreGuestProfileCandidate,
  type GuestIdentityProfileCandidate,
} from "../lib/guest-identity";

type UserRow = GuestIdentityProfileCandidate & {
  role?: string | null;
};

type AuthUserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  provider: string | null;
};

type DependencyConfig = {
  table: string;
  column: string;
};

const DEPENDENCY_CONFIG: DependencyConfig[] = [
  { table: "bookings", column: "user_id" },
  { table: "bookings_v2", column: "user_id" },
  { table: "booking_status_history_v2", column: "changed_by_user_id" },
  { table: "coupon_redemptions_v2", column: "user_id" },
  { table: "conversations", column: "guest_id" },
  { table: "conversations", column: "typing_user_id" },
  { table: "messages", column: "sender_id" },
  { table: "messages", column: "receiver_id" },
  { table: "messages", column: "deleted_by" },
  { table: "recent_views_v2", column: "user_id" },
  { table: "reviews_v2", column: "guest_user_id" },
  { table: "stories_v2", column: "author_user_id" },
];

const args = new Set(process.argv.slice(2));
const applyMode = args.has("--apply");
const allowMixedRoles = args.has("--allow-mixed-roles");
const jsonMode = args.has("--json");
const maxRows = Number(
  process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1] ?? "5000"
);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function createSupabase() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function buildKey(row: UserRow): string[] {
  const keys: string[] = [];
  const email = normalizeGuestEmail(row.email);
  const phone = normalizeGuestPhone(row.phone);

  if (email) keys.push(`email:${email}`);
  if (phone) keys.push(`phone:${phone}`);
  return keys;
}

function unionParents(parent: Map<string, string>, left: string, right: string): void {
  const leftRoot = findParent(parent, left);
  const rightRoot = findParent(parent, right);
  if (leftRoot !== rightRoot) {
    parent.set(rightRoot, leftRoot);
  }
}

function findParent(parent: Map<string, string>, id: string): string {
  const current = parent.get(id) ?? id;
  if (current === id) return id;
  const root = findParent(parent, current);
  parent.set(id, root);
  return root;
}

async function loadAuthUsers(supabase: ReturnType<typeof createSupabase>): Promise<AuthUserRow[]> {
  const authUsers: AuthUserRow[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw error;
    }

    const rows =
      data.users?.map((user) => ({
        id: user.id,
        email: normalizeGuestEmail(user.email),
        phone: normalizeGuestPhone(user.phone),
        provider:
          typeof user.app_metadata?.provider === "string"
            ? user.app_metadata.provider
            : typeof user.user_metadata?.provider === "string"
              ? user.user_metadata.provider
              : null,
      })) ?? [];

    authUsers.push(...rows);
    if (rows.length < 200) break;
    page += 1;
  }

  return authUsers;
}

async function loadUsers(supabase: ReturnType<typeof createSupabase>): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id,name,email,phone,city,state,about,date_of_birth,gender,avatar_url,onboarding_completed,updated_at,role")
    .limit(maxRows);

  if (error) {
    throw error;
  }

  return (data ?? []) as UserRow[];
}

async function countDependencyRows(
  supabase: ReturnType<typeof createSupabase>,
  config: DependencyConfig,
  userIds: string[]
): Promise<{ table: string; column: string; count: number; error: string | null }> {
  const result = await supabase.from(config.table).select("*", { head: true, count: "exact" }).in(config.column, userIds);
  return {
    table: config.table,
    column: config.column,
    count: result.count ?? 0,
    error: result.error?.message ?? null,
  };
}

async function updateDependencyRows(
  supabase: ReturnType<typeof createSupabase>,
  config: DependencyConfig,
  duplicateUserId: string,
  canonicalUserId: string
): Promise<{ table: string; column: string; updated: number; error: string | null }> {
  const existingRows = await supabase.from(config.table).select("id", { count: "exact" }).eq(config.column, duplicateUserId);
  if (existingRows.error) {
    return { table: config.table, column: config.column, updated: 0, error: existingRows.error.message };
  }

  const count = existingRows.count ?? 0;
  if (count === 0) {
    return { table: config.table, column: config.column, updated: 0, error: null };
  }

  const updateResult = await supabase.from(config.table).update({ [config.column]: canonicalUserId } as never).eq(config.column, duplicateUserId);
  return {
    table: config.table,
    column: config.column,
    updated: updateResult.error ? 0 : count,
    error: updateResult.error?.message ?? null,
  };
}

function chooseCanonicalId(rows: UserRow[], authUsers: AuthUserRow[]): string {
  const guestRows = rows.filter((row) => String(row.role ?? "").toLowerCase() === "guest");
  const sourceRows = guestRows.length > 0 ? guestRows : rows;
  const normalizedEmails = new Set(rows.map((row) => normalizeGuestEmail(row.email)).filter(Boolean));
  const normalizedPhones = new Set(rows.map((row) => normalizeGuestPhone(row.phone)).filter(Boolean));
  const preferredAuthRow = authUsers.find(
    (row) =>
      (row.email && normalizedEmails.has(row.email)) ||
      (row.phone && normalizedPhones.has(row.phone))
  );

  return pickCanonicalGuestProfile(sourceRows, preferredAuthRow?.id ?? null)?.id ?? sourceRows[0]!.id;
}

function createAuditPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(process.cwd(), ".codex-logs", `guest-identity-audit-${stamp}.json`);
}

async function main(): Promise<void> {
  const supabase = createSupabase();
  const [users, authUsers] = await Promise.all([loadUsers(supabase), loadAuthUsers(supabase)]);
  const parent = new Map<string, string>();
  const idsByKey = new Map<string, string[]>();

  for (const user of users) {
    parent.set(user.id, user.id);
    for (const key of buildKey(user)) {
      idsByKey.set(key, [...(idsByKey.get(key) ?? []), user.id]);
    }
  }

  for (const ids of idsByKey.values()) {
    if (ids.length < 2) continue;
    const [first, ...rest] = ids;
    for (const id of rest) {
      unionParents(parent, first!, id);
    }
  }

  const clusters = new Map<string, UserRow[]>();
  for (const user of users) {
    const root = findParent(parent, user.id);
    clusters.set(root, [...(clusters.get(root) ?? []), user]);
  }

  const duplicateClusters = Array.from(clusters.values()).filter((cluster) => cluster.length > 1);
  const dryRunResults = [];

  for (const cluster of duplicateClusters) {
    const canonicalUserId = chooseCanonicalId(cluster, authUsers);
    const canonical = pickCanonicalGuestProfile(cluster, canonicalUserId);
    const merged = mergeGuestProfileCandidates(cluster, canonicalUserId);
    const relatedAuthUsers = authUsers.filter((authUser) => {
      const normalizedEmail = normalizeGuestEmail(authUser.email);
      const normalizedPhone = normalizeGuestPhone(authUser.phone);
      return cluster.some(
        (row) =>
          (normalizedEmail && normalizedEmail === normalizeGuestEmail(row.email)) ||
          (normalizedPhone && getGuestPhoneLookupVariants(row.phone).includes(normalizedPhone))
      );
    });
    const dependencyCounts = await Promise.all(
      DEPENDENCY_CONFIG.map((config) => countDependencyRows(supabase, config, cluster.map((row) => row.id)))
    );
    const mixedRoles = Array.from(new Set(cluster.map((row) => String(row.role ?? "unknown").toLowerCase())));

    dryRunResults.push({
      canonicalUserId,
      applyEligible: allowMixedRoles || mixedRoles.every((role) => role === "guest" || role === "unknown"),
      mixedRoles,
      clusterUserIds: cluster.map((row) => row.id),
      normalizedEmails: Array.from(new Set(cluster.map((row) => normalizeGuestEmail(row.email)).filter(Boolean))),
      normalizedPhones: Array.from(new Set(cluster.map((row) => normalizeGuestPhone(row.phone)).filter(Boolean))),
      rows: cluster.map((row) => ({
        ...row,
        normalizedEmail: normalizeGuestEmail(row.email),
        normalizedPhone: normalizeGuestPhone(row.phone),
        profileScore: scoreGuestProfileCandidate(row),
      })),
      relatedAuthUserIds: relatedAuthUsers,
      dependencyCounts,
      proposedCanonical: canonical,
      mergedProfile: merged,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: applyMode ? "apply" : "dry-run",
    totalUsersScanned: users.length,
    totalAuthUsersScanned: authUsers.length,
    duplicateClusterCount: dryRunResults.length,
    clusters: dryRunResults,
  };

  const auditPath = createAuditPath();
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(report, null, 2));

  if (!applyMode) {
    if (jsonMode) {
      console.log(JSON.stringify({ ...report, auditPath }, null, 2));
      return;
    }

    console.log(`Guest identity dry-run generated at ${report.generatedAt}`);
    console.log(`Scanned ${report.totalUsersScanned} user rows and ${report.totalAuthUsersScanned} auth users.`);
    console.log(`Found ${report.duplicateClusterCount} duplicate guest identity cluster(s).`);
    console.log(`Audit JSON: ${auditPath}`);
    for (const cluster of dryRunResults) {
      console.log("");
      console.log(`Canonical user: ${cluster.canonicalUserId}`);
      console.log(`User IDs: ${cluster.clusterUserIds.join(", ")}`);
      console.log(`Roles: ${cluster.mixedRoles.join(", ")}`);
      console.log(`Emails: ${cluster.normalizedEmails.join(", ") || "none"}`);
      console.log(`Phones: ${cluster.normalizedPhones.join(", ") || "none"}`);
      console.log(
        `Dependencies: ${cluster.dependencyCounts
          .filter((entry) => entry.count > 0)
          .map((entry) => `${entry.table}.${entry.column}=${entry.count}`)
          .join(", ") || "none"}`
      );
    }
    return;
  }

  const applyResults = [];
  for (const cluster of dryRunResults) {
    if (!cluster.applyEligible) {
      applyResults.push({
        canonicalUserId: cluster.canonicalUserId,
        skipped: true,
        reason: "mixed_roles_detected_use_allow_mixed_roles_to_override",
      });
      continue;
    }

    const duplicateUserIds = cluster.clusterUserIds.filter((userId) => userId !== cluster.canonicalUserId);
    const dependencyUpdates = [];

    for (const duplicateUserId of duplicateUserIds) {
      for (const config of DEPENDENCY_CONFIG) {
        dependencyUpdates.push(
          await updateDependencyRows(supabase, config, duplicateUserId, cluster.canonicalUserId)
        );
      }
    }

    if (cluster.mergedProfile) {
      await supabase.from("users").upsert(
        {
          id: cluster.canonicalUserId,
          name: cluster.mergedProfile.name ?? null,
          email: cluster.mergedProfile.email ?? null,
          phone: cluster.mergedProfile.phone ?? null,
          city: cluster.mergedProfile.city ?? null,
          state: cluster.mergedProfile.state ?? null,
          about: cluster.mergedProfile.about ?? null,
          date_of_birth: cluster.mergedProfile.date_of_birth ?? null,
          gender: cluster.mergedProfile.gender ?? null,
          avatar_url: cluster.mergedProfile.avatar_url ?? null,
          onboarding_completed: Boolean(cluster.mergedProfile.onboarding_completed),
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "id" }
      );
    }

    const deletedRows = [];
    for (const duplicateUserId of duplicateUserIds) {
      const deleteResult = await supabase.from("users").delete().eq("id", duplicateUserId);
      deletedRows.push({
        userId: duplicateUserId,
        deleted: !deleteResult.error,
        error: deleteResult.error?.message ?? null,
      });
    }

    applyResults.push({
      canonicalUserId: cluster.canonicalUserId,
      duplicateUserIds,
      dependencyUpdates,
      deletedRows,
    });
  }

  const applyReport = {
    ...report,
    applyResults,
    auditPath,
  };

  fs.writeFileSync(auditPath, JSON.stringify(applyReport, null, 2));
  console.log(JSON.stringify(applyReport, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
