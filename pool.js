// pool.js：切块与回并（首次适应，空闲表按起点升序）
export function takenOf(free, len) {
  for (let i = 0; i < free.length; i += 1) {
    const start = free[i][0];
    const size = free[i][1];
    if (size >= len) {
      const rest = free.slice(0, i).concat(free.slice(i + 1));
      if (size > len) rest.splice(i, 0, [start + len, size - len]);
      return { block: [start, len], free: rest };
    }
  }
  return null;
}

export function giveBackOf(free, block) {
  let start = block[0];
  let end = block[0] + block[1];
  let merges = 0;
  const kept = [];
  for (const row of free) {
    if (row[0] + row[1] === start) {
      start = row[0];
      merges += 1;
    } else if (end === row[0]) {
      end = row[0] + row[1];
      merges += 1;
    } else {
      kept.push(row);
    }
  }
  const next = [];
  let placed = false;
  for (const row of kept) {
    if (!placed && row[0] > start) {
      next.push([start, end - start]);
      placed = true;
    }
    next.push(row);
  }
  if (!placed) next.push([start, end - start]);
  return { free: next, merges: merges };
}
