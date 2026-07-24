import test from "node:test";
import assert from "node:assert/strict";

import { createHostSessionToken, readHostSessionToken } from "@/lib/host-session-token";

test("host session tokens are signed, owner-bound, and expiring", () => {
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.ADMIN_SESSION_SECRET = "test-host-session-secret";
  try {
    const token = createHostSessionToken({ familyId: "family-a", userId: "user-a", maxAgeSeconds: 60 });
    assert.deepEqual(readHostSessionToken(token), {
      familyId: "family-a",
      userId: "user-a",
      expiresAt: readHostSessionToken(token)?.expiresAt,
    });
    assert.equal(readHostSessionToken(`${token}tampered`), null);
    assert.equal(
      readHostSessionToken(createHostSessionToken({ familyId: "family-a", userId: "user-a", maxAgeSeconds: -1 })),
      null
    );
  } finally {
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});
