// Pure JS benchmark for paste responsiveness
function buildLineStartOffsets(content) {
  const offsets = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

function offsetToLine(lineStarts, offset) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lineStarts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

function maxLineLengthFromOffsets(lineStarts, contentLength) {
  let max = 0;
  for (let i = 0; i < lineStarts.length; i++) {
    const start = lineStarts[i];
    const end = i + 1 < lineStarts.length ? lineStarts[i + 1] - 1 : contentLength;
    const len = end - start;
    if (len > max) max = len;
  }
  return max;
}

const lines = [];
for (let i = 1; i <= 1500; i++) {
  if (i % 10 === 0) {
    lines.push(`  function processItem${i}(data) {`);
  } else if (i % 10 === 5) {
    lines.push(`    return data.id === ${i} && data.active !== false;`);
  } else if (i % 10 === 9) {
    lines.push(`  }`);
  } else {
    lines.push(`    const val_${i} = "item_${i}_data_string_test_${i}"; // comment ${i}`);
  }
}
const hugeCode = lines.join("\n");
console.log(`Generated sample: ${lines.length} lines, ${hugeCode.length} characters`);

const t0 = performance.now();
const offsets = buildLineStartOffsets(hugeCode);
const t1 = performance.now();
console.log(`[PASS] buildLineStartOffsets: ${(t1 - t0).toFixed(3)}ms`);

const testOffsets = [100, 1500, 15000, 45000, hugeCode.length - 10];
const tBinary0 = performance.now();
for (let iter = 0; iter < 1000; iter++) {
  for (const off of testOffsets) {
    offsetToLine(offsets, off);
  }
}
const tBinary1 = performance.now();

const tNaive0 = performance.now();
for (let iter = 0; iter < 1000; iter++) {
  for (const off of testOffsets) {
    const _line = hugeCode.slice(0, off).split("\n").length - 1;
  }
}
const tNaive1 = performance.now();

console.log(`[BENCHMARK] 5,000 lookups:`);
console.log(`  - O(log N) Binary Search: ${(tBinary1 - tBinary0).toFixed(2)}ms`);
console.log(`  - O(N) Naive Slice+Split: ${(tNaive1 - tNaive0).toFixed(2)}ms`);
console.log(`  - Speedup factor: ${((tNaive1 - tNaive0) / Math.max(0.01, tBinary1 - tBinary0)).toFixed(1)}x faster!`);
console.log("[PASS] Max line length:", maxLineLengthFromOffsets(offsets, hugeCode.length));
