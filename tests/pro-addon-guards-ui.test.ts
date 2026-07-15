import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const propertyRoutePath = path.join(repoRoot, "app/api/host/pro/properties/create/route.ts");
const roomRoutePath = path.join(repoRoot, "app/api/host/stay-units/route.ts");
const propertyFormPath = path.join(repoRoot, "components/partners/pro/ProAddPropertyForm.tsx");
const roomManagerPath = path.join(repoRoot, "components/partners/rooms/HostRoomsManager.tsx");
const proDashboardShellPath = path.join(repoRoot, "components/partners/pro/FamloProDashboardShell.tsx");
const addonHandlersPath = path.join(repoRoot, "lib/pro-billing/addon-route-handlers.ts");
const mobileAppPath = path.join(repoRoot, "../famlo-mobile/src/App.tsx");
const mobileApiPath = path.join(repoRoot, "../famlo-mobile/src/api.ts");
const decimalMigrationPath = path.join(repoRoot, "supabase/migrations/20260622123000_host_pro_billing_decimal_amounts.sql");

const propertyRouteSource = fs.readFileSync(propertyRoutePath, "utf8");
const roomRouteSource = fs.readFileSync(roomRoutePath, "utf8");
const propertyFormSource = fs.readFileSync(propertyFormPath, "utf8");
const roomManagerSource = fs.readFileSync(roomManagerPath, "utf8");
const proDashboardShellSource = fs.readFileSync(proDashboardShellPath, "utf8");
const addonHandlersSource = fs.readFileSync(addonHandlersPath, "utf8");
const mobileAppSource = fs.readFileSync(mobileAppPath, "utf8");
const mobileApiSource = fs.readFileSync(mobileApiPath, "utf8");
const decimalMigrationSource = fs.readFileSync(decimalMigrationPath, "utf8");

test("pro property and room create routes validate paid add-on orders before activation", () => {
  assert.match(propertyRouteSource, /assertPaidHostProAddonOrderAvailable/);
  assert.match(roomRouteSource, /assertPaidHostProAddonOrderAvailable/);
});

test("pro add-on checkout UI shows pricing confirmation before Razorpay opens", () => {
  assert.match(propertyFormSource, /Property add-on: Rs/);
  assert.match(propertyFormSource, /Click OK to Pay and add\./);
  assert.match(roomManagerSource, /Room add-on: Rs/);
  assert.match(roomManagerSource, /Click OK to Pay and add\./);
});

test("web and mobile room create actions show paid add-on wording", () => {
  assert.match(roomManagerSource, /room\.id\.startsWith\("temp-"\) && proCreateStatus === "active"[\s\S]*"Pay to Add Room"/);
  assert.match(mobileAppSource, /editor\?\.mode === "create"[\s\S]*"Pay to Add Room"/);
});

test("mobile room editor renders payment errors inside the open modal", () => {
  assert.match(
    mobileAppSource,
    /segmented-tabs room-editor-tabs[\s\S]*feedback \? <div className={`inline-feedback \$\{feedback\.type\}`}>\{feedback\.text\}<\/div>/
  );
});

test("room first save returns a read-only machine-readable 402 before checkout creation", () => {
  assert.match(roomRouteSource, /buildHostProAddonQuote/);
  assert.match(roomRouteSource, /errorCode: "PRO_ROOM_ADDON_REQUIRED"/);
  assert.match(roomRouteSource, /paymentExecutionEnabled: paymentExecution\.ok/);
  assert.match(roomRouteSource, /clientId,[\s\S]*unitKey/);
  assert.doesNotMatch(roomRouteSource, /const checkout = await createHostProAddonCheckout/);
});

test("dedicated checkout is execution-gated and clients preserve the same draft", () => {
  assert.match(addonHandlersSource, /evaluateRuntimeSafety\("pro_billing_payment_execution"\)/);
  assert.match(addonHandlersSource, /PRO_BILLING_PAYMENT_EXECUTION_DISABLED/);
  assert.match(roomManagerSource, /const checkoutPayload = await prepareAddonCheckout\(\)/);
  assert.match(roomManagerSource, /await saveRoom\(room, paidAddonOrderId\)/);
  assert.match(mobileApiSource, /preserveErrorData: true/);
  assert.match(mobileAppSource, /const paidSave = await saveStayUnit\(\{\s*\.\.\.baseInput,\s*addonOrderId: checkoutResult\.billingOrderId/);
});

test("billing amounts support prorated decimal GST without weakening security", () => {
  assert.match(decimalMigrationSource, /host_pro_billing_orders/);
  assert.match(decimalMigrationSource, /gst_amount type numeric\(12,2\)/);
  assert.match(decimalMigrationSource, /total_amount type numeric\(12,2\)/);
  assert.doesNotMatch(decimalMigrationSource, /disable row level security/i);
});

test("pro room UI blocks new paid Pro room creation outside an active paid period", () => {
  assert.match(roomManagerSource, /blocked during grace/);
  assert.match(roomManagerSource, /Only an active paid Famlo Pro period can create a new Famlo Pro room/);
});

test("pro room create draft is not keyed to editable room fields", () => {
  assert.match(roomManagerSource, /const roomDraftIdKey = roomDrafts\.map\(\(room\) => room\.id\)\.join\("\|"\)/);
  assert.match(roomManagerSource, /const roomDraftIds = useMemo\(\(\) => \(roomDraftIdKey \? roomDraftIdKey\.split\("\|"\) : \[\]\), \[roomDraftIdKey\]\)/);
  assert.match(roomManagerSource, /\}, \[createDraftId, createMode, roomDraftIdKey, roomDraftIds\]\);/);
  assert.doesNotMatch(roomManagerSource, /\}, \[createDraftId, createMode, roomDrafts\]\);/);
});

test("pro dashboard keeps one room editor mounted for details and pricing tabs", () => {
  const roomPanel = proDashboardShellSource.slice(
    proDashboardShellSource.indexOf("{roomEditorTab === \"details\" || roomEditorTab === \"pricing\" ? ("),
    proDashboardShellSource.indexOf("{roomEditorTab === \"calendar\" ? (")
  );

  assert.match(roomPanel, /roomEditorTab === "details" \|\| roomEditorTab === "pricing"/);
  assert.equal((roomPanel.match(/<HostRoomsManager/g) ?? []).length, 1);
  assert.match(roomPanel, /focusSection=\{roomEditorTab === "pricing" \? "pricing" : "details"\}/);
});

test("pro room price fields are raw-editable inputs", () => {
  const pricingStart = roomManagerSource.indexOf("<span style={roomFieldLabelStyle}>Public room price</span>");
  const pricingSection = roomManagerSource.slice(
    pricingStart,
    roomManagerSource.indexOf("<div style={{ fontSize: \"11px\", fontWeight: 900", pricingStart)
  );

  assert.ok(pricingStart >= 0, "manual pricing section should render public room price");
  assert.match(pricingSection, /value=\{room\.priceFullday\} onChange=\{\(event\) => updateRoomField\(room\.id, "priceFullday", event\.target\.value\)\}/);
  assert.match(pricingSection, /value=\{room\.priceMorning\} onChange=\{\(event\) => updateRoomField\(room\.id, "priceMorning", event\.target\.value\)\}/);
  assert.match(pricingSection, /value=\{room\.priceAfternoon\} onChange=\{\(event\) => updateRoomField\(room\.id, "priceAfternoon", event\.target\.value\)\}/);
  assert.match(pricingSection, /value=\{room\.priceEvening\} onChange=\{\(event\) => updateRoomField\(room\.id, "priceEvening", event\.target\.value\)\}/);
  assert.doesNotMatch(pricingSection, /\bdisabled\b/);
  assert.doesNotMatch(pricingSection, /\breadOnly\b/);
  assert.doesNotMatch(roomManagerSource, /field === "priceMorning" \|\| field === "priceEvening"/);
});
