// poolrun.js：按共用处理预算推进事件，用尽则压账；收尾不限预算清账
import { takenOf, giveBackOf } from "./pool.js";

function isPosInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// 结构不合法报 E_BAD_EVENT；alloc 的长度不是正整数报 E_BAD_LEN。
// 这两类先于表状态错误，对全部事件统一先校验。
function validateEvent(event, spec) {
  if (!event || typeof event !== "object") {
    return makeError(spec.event_error_code || spec.bad_event_code || "E_BAD_EVENT", "事件结构不合法");
  }
  if (event.kind === "alloc") {
    if (!isPosInt(event.len)) {
      return makeError(spec.bad_len_code || "E_BAD_LEN", "长度必须是正整数");
    }
  } else if (event.kind === "release") {
    if (!isNonNegInt(event.start)) {
      return makeError(spec.event_error_code || spec.bad_event_code || "E_BAD_EVENT", "回收起点不合法");
    }
  } else {
    return makeError(spec.event_error_code || spec.bad_event_code || "E_BAD_EVENT", "事件类型不合法");
  }
  return null;
}

function makeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function pairOf(event) {
  return event.kind === "alloc" ? ["alloc", event.len] : ["release", event.start];
}

function cloneState(state) {
  const src = state || {};
  return {
    used: (src.used || []).map(function (row) { return [row[0], row[1]]; }),
    free: (src.free || []).map(function (row) { return [row[0], row[1]]; }),
    merges: src.merges || 0,
    ledger: (src.ledger || []).map(function (row) { return [row[0], row[1]]; }),
    applied: (src.applied || []).slice(),
    _ledgerIds: (src._ledgerIds || []).slice()
  };
}

// 按当前两张表判：放不下报 E_NO_ROOM、起点没占用块报 E_NO_BLOCK（随预算可能撞不上）。
function applyEntry(state, pair, spec) {
  if (pair[0] === "alloc") {
    const got = takenOf(state.free, pair[1]);
    if (got === null) {
      throw makeError(spec.no_room_code || "E_NO_ROOM", "空闲表一块都放不下");
    }
    state.free = got.free;
    state.used = state.used.concat([got.block]);
    state.used.sort(function (a, b) { return a[0] - b[0]; });
  } else {
    const index = state.used.findIndex(function (row) { return row[0] === pair[1]; });
    if (index < 0) {
      throw makeError(spec.no_block_code || "E_NO_BLOCK", "该起点上没有占用块");
    }
    const block = state.used[index];
    state.used = state.used.slice(0, index).concat(state.used.slice(index + 1));
    const back = giveBackOf(state.free, block);
    state.free = back.free;
    state.merges += back.merges;
  }
}

export function step(spec) {
  const events = spec.events || [];
  const state = cloneState(spec.state);

  // 结构与长度先统一校验，不看预算、不看表状态。
  for (let i = 0; i < events.length; i += 1) {
    const problem = validateEvent(events[i], spec);
    if (problem) { throw problem; }
  }

  let budget = Number.isFinite(spec.budget) ? Math.max(0, Math.trunc(spec.budget)) : 0;
  const ledgerBeforeCount = state.ledger.length;
  const bound = ledgerBeforeCount + events.length;
  let served = 0;
  let judged = 0;

  // 预算内先把压着的旧账按 FIFO 做完，再处理新事件。
  while (state.ledger.length > 0 && budget > 0) {
    const pair = state.ledger.shift();
    state._ledgerIds.shift();
    applyEntry(state, pair, spec);
    state.applied.push(pair);
    judged += 1;
    served += 1;
    budget -= 1;
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const pair = pairOf(event);
    if (state.applied.indexOf(event.id) >= 0 || state.applied.some(function (row) {
      return Array.isArray(row) && row[0] === pair[0] && row[1] === pair[1];
    })) {
      // 重放：已处理过的事件直接跳过，不花预算、不重复处理。
      judged += 1;
      continue;
    }
    if (budget <= 0) {
      // 预算用尽，连着的剩余事件原样压账，留待收尾。
      state.ledger.push(pair);
      state._ledgerIds.push(event.id);
      judged += 1;
      continue;
    }
    applyEntry(state, pair, spec);
    state.applied.push(event.id);
    judged += 1;
    served += 1;
    budget -= 1;
  }

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger,
    judged: judged,
    judged_bound: bound
  };
}

// 不限预算把账做完，返回补齐条数。
export function close(spec) {
  const state = cloneState(spec.state);
  let catchup = 0;
  while (state.ledger.length > 0) {
    const pair = state.ledger.shift();
    state._ledgerIds.shift();
    applyEntry(state, pair, spec);
    state.applied.push(pair);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
