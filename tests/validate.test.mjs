import assert from "node:assert/strict";
import { test } from "node:test";
import { validate } from "../scripts/validate.mjs";

test("the repository passes its own validation", () => {
  assert.deepEqual(validate(), []);
});
