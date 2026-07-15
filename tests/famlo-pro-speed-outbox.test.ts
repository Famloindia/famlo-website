import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const source = (file: string): string => readFileSync(path.join(repoRoot, file), "utf8");

test("room add saves locally and queues Channex provisioning instead of calling Channex inline", () => {
  const route = source("app/api/host/stay-units/route.ts");

  assert.match(route, /mutateStayUnitWithSchemaFallback\(\s*supabase,\s*"insert"/);
  assert.match(route, /consumePaidHostProAddonOrder/);
  assert.match(route, /idempotentCreateRetryUnitId/);
  assert.match(route, /allowNameFallback: false/);
  assert.match(route, /\[stay-units:save\] idempotent create retry resolved existing room/);
  assert.match(route, /aliasUnitKeys: \[clientId, unitId\]/);
  assert.match(route, /loadVerifiedSavedStayUnitRow/);
  assert.match(route, /const canonicalStayUnitId = asNullableString\(verifiedStayUnitRow\.id\)/);
  assert.match(route, /makeIdempotentCreateUnitKey/);
  assert.match(route, /createHash\("sha256"\)/);
  assert.match(route, /return `draft-\$\{digest\}`/);
  assert.match(route, /delete payload\.photos/);
  assert.match(route, /delete payload\.locality_photos/);
  assert.match(route, /delete roomDraftPatch\.roomPhotos/);
  assert.match(route, /delete roomDraftPatch\.localityPhotos/);
  assert.match(route, /targetReference: canonicalStayUnitId/);
  assert.match(route, /enqueueChannexRoomProvisioningJob/);
  assert.match(route, /stayUnitId: canonicalStayUnitId/);
  assert.match(route, /stayUnit: withCanonicalStayUnitIdentifiers/);
  assert.match(route, /unitId: canonicalStayUnitId/);
  assert.match(route, /canonicalStayUnitId/);
  assert.match(route, /nudgeRoomChannexWorker\(\{\s*requestUrl: request\.url,\s*workerId: "room-provisioning-after-save"/);
  assert.match(route, /after\(async \(\) => \{/);
  assert.match(route, /workerId: "room-provisioning-after-save",\s*limit: 5,\s*passes: 2/);
  assert.doesNotMatch(route, /await nudgeRoomChannexWorker/);
  assert.doesNotMatch(route, /await triggerRoomChannexWorker/);
  assert.match(route, /channexProvisioning[\s\S]*status: provisioningJobId \? "queued" : "not_mapped"/);
  assert.doesNotMatch(route, /await provisionSingleStayUnitInChannex/);
});

test("room edit queues Channex refresh for mapped state and occupancy only when max guests changed", () => {
  const route = source("app/api/host/stay-units/route.ts");

  assert.match(route, /const shouldSyncMaxGuests = previousMaxGuests == null \|\| previousMaxGuests !== nextMaxGuests/);
  assert.match(route, /loadChannexMappingReadiness/);
  assert.match(route, /room-provisioning-after-edit/);
  assert.match(route, /workerId: "room-provisioning-after-edit",\s*limit: 5,\s*passes: 2/);
  assert.match(route, /reason: "room_details_saved"/);
  assert.match(route, /if \(canonicalStayUnitId && shouldSyncMaxGuests && \(channexProvisioning\?\.queuedJobIds\.length \?\? 0\) === 0\)/);
  assert.match(route, /enqueueChannexRoomOccupancyJob/);
  assert.match(route, /stayUnitId: canonicalStayUnitId/);
  assert.match(route, /nudgeRoomChannexWorker\(\{\s*requestUrl: request\.url,\s*workerId: "room-occupancy-after-save"/);
  assert.doesNotMatch(route, /await nudgeRoomChannexWorker/);
  assert.doesNotMatch(route, /await triggerRoomChannexWorker/);
  assert.doesNotMatch(route, /await syncMappedChannexRoomOccupancy/);
});

test("room-origin Channex full sync keeps the queued provisioning window", () => {
  const jobs = source("lib/channex-ari-jobs.ts");

  assert.match(jobs, /const queuedRange = \{/);
  assert.match(jobs, /jobType === "full_sync" && asString\(payload\.source_route\) !== "\/api\/host\/stay-units"/);
  assert.match(jobs, /\? buildLongRange\(\)\s*:\s*queuedRange/);
});

test("room list returns edit-critical room details without requiring the full dashboard", () => {
  const route = source("app/api/host/stay-units/route.ts");

  assert.match(route, /description: record\.description/);
  assert.match(route, /bedInfo: record\.bedInfo/);
  assert.match(route, /bathroomType: record\.bathroomType/);
  assert.match(route, /toiletTypes: record\.toiletTypes/);
  assert.match(route, /roomSizeSqm: record\.roomSizeSqm/);
  assert.match(route, /lat: record\.lat/);
  assert.match(route, /lng: record\.lng/);
  assert.match(route, /priceMorning: record\.priceMorning/);
  assert.match(route, /priceAfternoon: record\.priceAfternoon/);
  assert.match(route, /priceEvening: record\.priceEvening/);
  assert.match(route, /amenities: record\.amenities/);
});

test("room draft reconciliation keeps canonical id separate from unit key", () => {
  const stayUnits = source("lib/stay-units.ts");

  assert.match(stayUnits, /const roomUnitKey = asNullableString\(room\.unitKey \?\? room\.unit_key\)/);
  assert.match(stayUnits, /roomUnitKey != null && roomUnitKey === row\.unitKey/);
  assert.match(stayUnits, /asNullableString\(roomRow\.unitKey\)[\s\S]*asNullableString\(roomRow\.unit_key\)[\s\S]*asNullableString\(roomRow\.id\)/);
  assert.match(stayUnits, /preserveCanonicalRoomMedia/);
  assert.match(stayUnits, /desiredRecord\.photos\.length > 0 \? desiredRecord\.photos : existingRow\.photos/);
  assert.match(stayUnits, /desiredRecord\.localityPhotos\.length > 0 \? desiredRecord\.localityPhotos : existingRow\.localityPhotos/);
});

test("stay_units_v2 stores toilet fields instead of silently stripping them", () => {
  const migration = source("supabase/migrations/20260617172800_stay_units_v2_toilet_fields.sql");

  assert.match(migration, /add column if not exists toilet_types text\[\]/i);
  assert.match(migration, /add column if not exists toilet_type text/i);
  assert.doesNotMatch(migration, /disable row level security/i);
});

test("photo upload resolves canonical room id before compatibility fallbacks", () => {
  const uploadRoute = source("app/api/host/stay-units/upload-photos/route.ts");

  assert.match(uploadRoute, /function isLikelyUuid/);
  assert.match(uploadRoute, /if \(!isLikelyUuid\(lookupId\)\) continue/);
  assert.match(uploadRoute, /isInvalidUuidLookupError/);
  assert.match(uploadRoute, /hostId: hostAccess\.hostId/);
  assert.match(uploadRoute, /eq\("legacy_family_id", input\.familyId\)/);
  assert.match(uploadRoute, /eq\("host_id", input\.hostId\)/);
  assert.match(uploadRoute, /unit_key", lookupIds/);
  assert.match(uploadRoute, /eq\("name", roomName\)/);
  assert.match(uploadRoute, /loadUploadLookupDiagnostics/);
  assert.match(uploadRoute, /\[stay-units:upload-photos\] room_not_found/);
  assert.match(uploadRoute, /stayUnit: mappedUpdated[\s\S]*withCanonicalStayUnitIdentifiers/);
  assert.match(uploadRoute, /unitId: canonicalUnitId/);
  assert.match(uploadRoute, /canonicalStayUnitId: canonicalUnitId/);
});

test("host property reels grant allows service-role media reads without broad public access", () => {
  const migration = source("supabase/migrations/20260617093000_host_property_reels_service_role_select.sql");

  assert.match(migration, /grant select on table public\.host_property_reels to service_role/i);
  assert.doesNotMatch(migration, /to anon/i);
  assert.doesNotMatch(migration, /disable row level security/i);
});

test("mobile uploads room photos with canonical saved room id from save response", () => {
  const api = source("../famlo-mobile/src/api.ts");
  const app = source("../famlo-mobile/src/App.tsx");

  assert.match(api, /canonicalStayUnitId\?: string \| null/);
  assert.match(api, /formData\.set\("unitId", input\.unitId\)/);
  assert.match(app, /paidSave\.data\.canonicalStayUnitId[\s\S]*paidSave\.data\.unitId[\s\S]*paidSave\.data\.stayUnit\.canonicalStayUnitId[\s\S]*paidSave\.data\.stayUnit\.unitId[\s\S]*paidSave\.data\.stayUnit\.id/);
  assert.match(app, /result\.data\.canonicalStayUnitId[\s\S]*result\.data\.unitId[\s\S]*result\.data\.stayUnit\.canonicalStayUnitId[\s\S]*result\.data\.stayUnit\.unitId[\s\S]*result\.data\.stayUnit\.id/);
  assert.match(app, /\[famlo-mobile\]\[room-photo-upload\] start/);
  assert.match(app, /Room saved and Channex sync is queued\. Photo upload failed/);
  assert.match(app, /onRetry\(\);\s*setFeedback\(\{\s*type:\s*"error",\s*text:\s*`Room saved and Channex sync is queued\. Photo upload failed:/);
  assert.doesNotMatch(app, /Failed to save room\.\s*Room saved and Channex sync is queued\. Photo upload failed/);
});

test("website stages pre-save room photos and uploads only after canonical room save", () => {
  const manager = source("components/partners/rooms/HostRoomsManager.tsx");

  assert.match(manager, /operation: room\.id\.startsWith\("temp-"\) \? "create" : "upsert"/);
  assert.match(manager, /stagePhotoUploads\(roomId, selectedFiles, kind\)/);
  assert.match(manager, /const canonicalRoomId = payload\.canonicalStayUnitId \?\? payload\.unitId \?\? payload\.stayUnit\.id/);
  assert.match(manager, /unitId: canonicalRoomId[\s\S]*clientId: previousId/);
  assert.match(manager, /Room saved\. Photos uploading\.\.\./);
  assert.match(manager, /Photo upload failed:[\s\S]*Retry upload/);
  assert.doesNotMatch(manager, /Save the room once before uploading/);
});

test("mobile waits for canonical room refresh before save completion", () => {
  const app = source("../famlo-mobile/src/App.tsx");

  const saveFlow = app.slice(app.indexOf("const handleSaveRoomDraft"), app.indexOf("const handleUploadRoomPhotos"));
  assert.match(saveFlow, /await loadProperties\(true\)/);
  assert.doesNotMatch(saveFlow, /void loadProperties\(true\)/);
});

test("mobile dashboard refresh reloads the fast room list instead of preserving stale rooms", () => {
  const app = source("../famlo-mobile/src/App.tsx");
  const overviewLoader = app.slice(app.indexOf("const loadOverview"), app.indexOf("const loadFreeWorkspaceData"));

  assert.match(overviewLoader, /force \? loadStayUnits\(familyId, "dashboard", "list"\) : Promise\.resolve\(null\)/);
  assert.match(overviewLoader, /refreshedStayUnits\?\.data\?\.stayUnits/);
  assert.match(overviewLoader, /preferDetailedStayUnits\(current\.stayUnits, refreshedStayUnits\.data\.stayUnits\)/);
});

test("room provisioning nudge runs a bounded second worker pass for initial ARI", () => {
  const jobs = source("lib/channex-ari-jobs.ts");

  assert.match(jobs, /passes\?: number/);
  assert.match(jobs, /const passes = Math\.max\(1, Math\.min\(input\.passes \?\? 1, 3\)\)/);
  assert.match(jobs, /for \(let pass = 0; pass < passes; pass \+= 1\)/);
});

test("payment verification finalizes Pro then queues Channex bootstrap without blocking checkout open", () => {
  const checkoutRoute = source("app/api/host/pro/billing/checkout/route.ts");
  const verifyRoute = source("app/api/host/pro/billing/verify/route.ts");

  assert.match(checkoutRoute, /createHostProBillingCheckout/);
  assert.doesNotMatch(checkoutRoute, /enqueueChannexProBootstrapJob/);
  assert.match(verifyRoute, /verifyRazorpayPaymentSignature/);
  assert.match(verifyRoute, /verifyAndFinalizeHostProBillingOrder/);
  assert.match(verifyRoute, /enqueueChannexProBootstrapJob/);
  assert.match(verifyRoute, /channexBootstrap:\s*\{/);
});

test("calendar sync returns saved projection/status and queues Channex instead of pulling inline", () => {
  const syncRoute = source("app/api/host/pro/calendar/sync/route.ts");
  const api = source("../famlo-mobile/src/api.ts");

  assert.match(syncRoute, /loadProjectedCalendarCells/);
  assert.match(syncRoute, /enqueueChannexAriSyncJobs/);
  assert.doesNotMatch(syncRoute, /pullChannexCalendarForFamlo/);
  assert.match(api, /\/api\/host\/pro\/calendar\/snapshot/);
});

test("worker completes queued room jobs only through the Channex room sync processor", () => {
  const framework = source("lib/channel-provider-framework.ts");
  const jobs = source("lib/channex-room-sync-jobs.ts");

  assert.match(framework, /isChannexRoomSyncJob\(job\)/);
  assert.match(framework, /processChannexRoomSyncJob\(supabase, job\)/);
  assert.match(jobs, /provisionSingleStayUnitInChannex/);
  assert.match(jobs, /updateChannexRoomTypeOccupancy/);
  assert.match(jobs, /updateChannexRatePlanOccupancy/);
  assert.match(jobs, /export function queuedRoomSyncStatus\(jobIds: string\[\], message: string\): ChannexRoomSyncStatus \{\s*return \{\s*status: jobIds\.length > 0 \? "queued" : "not_mapped"/);
});
