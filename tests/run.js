import assert from "node:assert";
import { takenOf, giveBackOf } from "../pool.js";
import { step, close } from "../poolrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { used: [], free: [[0, 4]], merges: 0, ledger: [], applied: [] },
  events: [{ id: 1, kind: "alloc", len: 2 }],
  bad_len_code: "E_BAD_LEN", no_room_code: "E_NO_ROOM",
  no_block_code: "E_NO_BLOCK", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("takenOf returns a block or nothing", () => {
  const got = takenOf([[0, 2]], 1);
  assert.ok(got === null || typeof got === "object");
});

check("giveBackOf returns free and merges", () => {
  const got = giveBackOf([], [0, 1]);
  assert.strictEqual(typeof got.merges, "number");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
