import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createHostSessionToken,
  HOST_SESSION_COOKIE_NAME,
  verifyHostSessionToken,
} from "@/lib/host-session";

test("canonical host session token is shared by login, property resolution, chat, and logout", () => {
  const previousSecret = process.env.HOST_SESSION_SECRET;
  process.env.HOST_SESSION_SECRET = ["host", "session", "test", "secret", "at-least-24-characters"].join("-");
  const token = createHostSessionToken({
    familyId: "family-1",
    hostUserId: "host-user-1",
    now: 1_800_000_000_000,
  });
  const verified = verifyHostSessionToken(token, 1_800_000_001_000);
  if (previousSecret === undefined) {
    delete process.env.HOST_SESSION_SECRET;
  } else {
    process.env.HOST_SESSION_SECRET = previousSecret;
  }

  assert.equal(HOST_SESSION_COOKIE_NAME, "famlo-host-session");
  assert.equal(verified?.familyId, "family-1");
  assert.equal(verified?.hostUserId, "host-user-1");

  const loginRoute = readFileSync("app/api/partners/login/route.ts", "utf8");
  const resolveStayRoute = readFileSync("app/api/partners/resolve-stay/route.ts", "utf8");
  const appSessionRoute = readFileSync("app/api/app/session/route.ts", "utf8");
  const chatAccess = readFileSync("lib/chat-access.ts", "utf8");

  assert.match(loginRoute, /HOST_SESSION_COOKIE_NAME/);
  assert.match(resolveStayRoute, /HOST_SESSION_COOKIE_NAME/);
  assert.match(appSessionRoute, /HOST_SESSION_COOKIE_NAME/);
  assert.match(chatAccess, /resolveVerifiedHostSession/);
  assert.doesNotMatch(resolveStayRoute, /host-session-token/);
  assert.doesNotMatch(chatAccess, /host-session-token/);
});
