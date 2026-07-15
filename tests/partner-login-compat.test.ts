import assert from "node:assert/strict";
import test from "node:test";

import { isMissingColumnError, safeSelectFamilyOptionalField } from "@/lib/partner-login-compat";

test("isMissingColumnError detects Postgres missing-column errors", () => {
  assert.equal(isMissingColumnError({ code: "42703", message: "column families.host_password does not exist" }), true);
  assert.equal(isMissingColumnError({ message: "column families.email does not exist" }), true);
  assert.equal(isMissingColumnError({ code: "23505", message: "duplicate key value violates unique constraint" }), false);
  assert.equal(isMissingColumnError(null), false);
});

test("safeSelectFamilyOptionalField returns null when the optional column is missing", async () => {
  const supabase = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: null,
                  error: { code: "42703", message: "column families.host_password does not exist" },
                }),
              };
            },
          };
        },
      };
    },
  } as never;

  const result = await safeSelectFamilyOptionalField(supabase, "fam-1", "host_password");
  assert.equal(result, null);
});

test("safeSelectFamilyOptionalField returns the field value when present", async () => {
  const supabase = {
    from() {
      return {
        select(fieldName: string) {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: { [fieldName]: "secret-1234" },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as never;

  const result = await safeSelectFamilyOptionalField(supabase, "fam-1", "password");
  assert.equal(result, "secret-1234");
});
