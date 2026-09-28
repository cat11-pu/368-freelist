// pool.js：首次适应切块与回收合并（纯函数，不改入参）

// 按首次适应从空闲表里切一块：取起点升序中第一个长度够的块，
// 切出前一段当占用，剩余留在空闲表；一块都不够返回 null。
export function takenOf(free, len) {
  for (let i = 0; i < free.length; i += 1) {
    const block = free[i];
    if (block[1] >= len) {
      const next = free.slice();
      const rest = [block[0] + len, block[1] - len];
      if (rest[1] > 0) { next[i] = rest; } else { next.splice(i, 1); }
      return { block: [block[0], len], free: next };
    }
  }
  return null;
}

// 把占用块放回空闲表，并与紧挨着的左右空闲块各并一次。
export function giveBackOf(free, block) {
  const start = block[0];
  const end = start + block[1];
  const kept = free.filter(function (row) { return row[0] !== end && row[0] + row[1] !== start; });
  let merged = free.length - kept.length;
  let head = start;
  let tail = end;
  free.forEach(function (row) {
    const rowEnd = row[0] + row[1];
    if (rowEnd === start) { head = row[0]; }
    else if (row[0] === end) { tail = row[0] + row[1]; }
  });
  const next = kept.concat([[head, tail - head]]);
  next.sort(function (a, b) { return a[0] - b[0]; });
  return { free: next, merges: merged };
}
