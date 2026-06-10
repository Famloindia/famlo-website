import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const propertyRoutePath = path.join(repoRoot, "app/api/host/pro/properties/create/route.ts");
const roomRoutePath = path.join(repoRoot, "app/api/host/stay-units/route.ts");
const propertyFormPath = path.join(repoRoot, "components/partners/pro/ProAddPropertyForm.tsx");
const roomManagerPath = path.join(repoRoot, "components/partners/rooms/HostRoomsManager.tsx");

const propertyRouteSource = fs.readFileSync(propertyRoutePath, "utf8");
const roomRouteSource = fs.readFileSync(roomRoutePath, "utf8");
const propertyFormSource = fs.readFileSync(propertyFormPath, "utf8");
const roomManagerSource = fs.readFileSync(roomManagerPath, "utf8");

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
