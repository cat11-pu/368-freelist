// poolrun.js：按处理预算处理并留账
import { takenOf, giveBackOf } from "./pool.js";

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function codesOf(spec) {
  return {
    badEvent: spec.event_error_code || "E_BAD_EVENT",
    badLen: spec.bad_len_code || "E_BAD_LEN",
    noRoom: spec.no_room_code || "E_NO_ROOM",
    noBlock: spec.no_block_code || "E_NO_BLOCK"
  };
}

function insertUsed(used, block) {
  const next = [];
  let placed = false;
  for (const row of used) {
    if (!placed && row[0] > block[0]) {
      next.push(block);
      placed = true;
    }
    next.push(row);
  }
  if (!placed) next.push(block);
  return next;
}

function applyEvent(tables, event, codes) {
  if (!event || typeof event !== "object" ||
      (event.kind !== "alloc" && event.kind !== "release")) {
    throw fail(codes.badEvent);
  }
  if (event.kind === "alloc") {
    if (!Number.isInteger(event.len) || event.len <= 0) {
      throw fail(codes.badLen);
    }
    const got = takenOf(tables.free, event.len);
    if (!got) throw fail(codes.noRoom);
    tables.free = got.free;
    tables.used = insertUsed(tables.used, got.block);
  } else {
    if (!Number.isInteger(event.start)) {
      throw fail(codes.badEvent);
    }
    const index = tables.used.findIndex(function (row) { return row[0] === event.start; });
    if (index === -1) throw fail(codes.noBlock);
    const block = tables.used[index];
    tables.used = tables.used.filter(function (_, i) { return i !== index; });
    const back = giveBackOf(tables.free, block);
    tables.free = back.free;
    tables.merges += back.merges;
  }
}

function run(spec, budget) {
  const state = spec.state;
  const codes = codesOf(spec);
  const tables = {
    used: state.used.map(function (row) { return [row[0], row[1]]; }),
    free: state.free.map(function (row) { return [row[0], row[1]]; }),
    merges: state.merges
  };
  const applied = state.applied.slice();
  const fresh = (spec.events || []).filter(function (event) {
    return !event || event.id === undefined || applied.indexOf(event.id) === -1;
  });
  const queue = state.ledger.concat(fresh);
  const bound = queue.length;
  const pending = [];
  let served = 0;
  let judged = 0;
  let remaining = budget;
  for (const event of queue) {
    if (remaining <= 0) {
      pending.push(event);
      continue;
    }
    remaining -= 1;
    judged += 1;
    applyEvent(tables, event, codes);
    if (event && event.id !== undefined) applied.push(event.id);
    served += 1;
  }
  const nextState = {
    used: tables.used,
    free: tables.free,
    merges: tables.merges,
    ledger: pending,
    applied: applied
  };
  return {
    state: nextState,
    served: served,
    ledger_before: pending.length,
    ledger: pending.map(function (event) {
      return event.kind === "alloc" ? ["alloc", event.len] : ["release", event.start];
    }),
    judged: judged,
    judged_bound: bound
  };
}

export function step(spec) {
  return run(spec, spec.budget || 0);
}

export function close(spec) {
  const done = run(Object.assign({}, spec, { events: [] }), Infinity);
  return { state: done.state, catchup: done.served };
}
