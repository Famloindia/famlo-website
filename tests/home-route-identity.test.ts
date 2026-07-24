import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  getHomestayCanonicalRedirect,
  resolveHomeRouteWithRepository,
  type HomeRouteRepository,
} from "@/lib/home-route-resolution";
import { buildHomestayPath } from "@/lib/slug";

type Row = Record<string, unknown>;

const FAMILY_A = "a2f31723-1e03-418a-93ae-42cfcd8b4168";
const FAMILY_B = "51fee51f-b11f-4924-80be-6c043143e5a0";
const HOST_A = "d865427e-3f34-4961-80db-5f40630cbf92";
const HOST_B = "907d3d23-0fad-442b-8287-8a5d452405ab";
const USER_ID = "4569dda3-02ee-4551-9b75-bfba8e920f55";

function repositoryFixture(options?: { publicFamilyIds?: string[] }): HomeRouteRepository {
  const families = new Map<string, Row>([
    [FAMILY_A, { id: FAMILY_A, user_id: USER_ID, name: "Aryan Krishan's Home", is_active: true, is_accepting: true }],
    [FAMILY_B, { id: FAMILY_B, user_id: USER_ID, name: "London Home", is_active: true, is_accepting: true }],
  ]);
  const hosts = new Map<string, Row>([
    [HOST_A, { id: HOST_A, user_id: USER_ID, legacy_family_id: FAMILY_A }],
    [HOST_B, { id: HOST_B, user_id: USER_ID, legacy_family_id: FAMILY_B }],
  ]);
  const publicFamilyIds = options?.publicFamilyIds ?? [FAMILY_A, FAMILY_B];

  return {
    async loadFamilyById(id) {
      return families.get(id) ?? null;
    },
    async loadHostById(id) {
      return hosts.get(id) ?? null;
    },
    async loadHostByFamilyId(id) {
      return [...hosts.values()].find((host) => host.legacy_family_id === id) ?? null;
    },
    async loadPublicFamiliesByUserId(userId) {
      if (userId !== USER_ID) return [];
      return publicFamilyIds.map((id) => families.get(id)).filter((row): row is Row => Boolean(row));
    },
  };
}

test("a family UUID resolves only its intended property and associated host", async () => {
  const result = await resolveHomeRouteWithRepository(repositoryFixture(), FAMILY_A);
  assert.equal(result.kind, "family");
  assert.equal(result.familyId, FAMILY_A);
  assert.equal(result.hostId, HOST_A);
  assert.equal(result.familyRow?.name, "Aryan Krishan's Home");
});

test("incorrect cosmetic slug redirects to the canonical family URL", async () => {
  const result = await resolveHomeRouteWithRepository(repositoryFixture(), FAMILY_A);
  const canonicalPath = buildHomestayPath("Aryan Krishan", "IIT", "Jodhpur", FAMILY_A);
  assert.equal(
    getHomestayCanonicalRedirect(result, "wrong-slug", canonicalPath),
    canonicalPath
  );
  assert.equal(
    getHomestayCanonicalRedirect(result, "aryan-krishan-iit-jodhpur", canonicalPath),
    null
  );
});

test("a legacy host UUID with exactly one public family resolves only as a redirect", async () => {
  const result = await resolveHomeRouteWithRepository(
    repositoryFixture({ publicFamilyIds: [FAMILY_A] }),
    HOST_A
  );
  const canonicalPath = buildHomestayPath("Aryan Krishan", "IIT", "Jodhpur", FAMILY_A);
  assert.equal(result.kind, "legacy-host");
  assert.equal(result.familyId, FAMILY_A);
  assert.equal(getHomestayCanonicalRedirect(result, "aryan-krishan-iit-jodhpur", canonicalPath), canonicalPath);
});

test("a legacy host UUID with multiple public families never selects one", async () => {
  const result = await resolveHomeRouteWithRepository(repositoryFixture(), HOST_A);
  assert.equal(result.kind, "ambiguous-legacy-host");
  assert.equal(result.familyId, null);
  assert.equal(result.hostId, null);
  assert.deepEqual(result.legacyPublicFamilyIds, [FAMILY_B, FAMILY_A].sort());
});

test("a legacy host UUID with no public family returns not-found", async () => {
  const result = await resolveHomeRouteWithRepository(
    repositoryFixture({ publicFamilyIds: [] }),
    HOST_A
  );
  assert.equal(result.kind, "not-found");
  assert.equal(result.familyId, null);
});

test("two properties owned by one host user remain independently addressable", async () => {
  const [first, second] = await Promise.all([
    resolveHomeRouteWithRepository(repositoryFixture(), FAMILY_A),
    resolveHomeRouteWithRepository(repositoryFixture(), FAMILY_B),
  ]);
  assert.equal(first.familyId, FAMILY_A);
  assert.equal(first.hostId, HOST_A);
  assert.equal(second.familyId, FAMILY_B);
  assert.equal(second.hostId, HOST_B);
  assert.notEqual(first.familyId, second.familyId);
});

test("public cards, rooms, booking and dashboard preview links stay family-scoped", () => {
  const root = process.cwd();
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");
  const discovery = read("lib/discovery.ts");
  const roomPage = read("app/host/[slug]/room/[roomId]/page.tsx");
  const bookingPage = read("app/homes/[id]/book/page.tsx");
  const homestayPage = read("app/homestay/[slug]/[id]/page.tsx");
  const profileTab = read("components/partners/tabs/ProfileTab.tsx");

  assert.match(discovery, /id:\s*familyId,[\s\S]*?hostId:\s*typeof row\.id/);
  assert.doesNotMatch(discovery, /\.or\(`id\.eq\.\$\{id\},legacy_family_id\.eq\.\$\{id\}`\)/);
  assert.match(roomPage, /const familyId = resolvedRoute\.familyId;[\s\S]*?if \(!familyId \|\| !resolvedRoute\.familyRow\) notFound\(\)/);
  assert.match(roomPage, /directRoom\.legacyFamilyId === resolved\.familyId/);
  assert.match(bookingPage, /if \(!resolved\.familyId \|\| !family\) notFound\(\)/);
  assert.match(homestayPage, /permanentRedirect\(redirectPath\)/);
  assert.match(profileTab, /buildHomestayPath\([\s\S]*?familyId/);
});

test("the homestay proxy enforces canonical redirects before React streaming", () => {
  const proxySource = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");

  assert.match(proxySource, /resolveHomeRoute\(supabase, requestedId\)/);
  assert.match(proxySource, /NextResponse\.redirect\([\s\S]+?, 308\)/);
  assert.match(proxySource, /status: 404/);
  assert.match(proxySource, /matcher: \["\/homestay\/:slug\/:id"\]/);
});
