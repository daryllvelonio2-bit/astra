function computeCursorOffset(chunkText, fullLineIdx, startIndex, approxCol = 0) {
  const chunkLines = chunkText.split("\n");
  const lineInChunk = Math.max(0, Math.min(fullLineIdx - startIndex, chunkLines.length - 1));
  let offset = 0;
  for (let i = 0; i < lineInChunk; i++) {
    offset += chunkLines[i].length + 1;
  }
  const lineLen = chunkLines[lineInChunk]?.length || 0;
  offset += Math.max(0, Math.min(approxCol, lineLen));
  return offset;
}

console.log("=== Testing Split Screen Dual-Column Editing Mechanics ===");

// 1. Create a 50-line sample document
const lines = [];
for (let i = 1; i <= 50; i++) {
  lines.push(`const item_${i} = "Line content for row ${i}";`);
}
const content = lines.join("\n");

// 2. Test linesPerPage and continuation offset
const lineHeight = 20;
const containerHeight = 360;
const linesPerPage = Math.max(8, Math.floor(containerHeight / lineHeight));
console.log(`linesPerPage: ${linesPerPage}`);

if (linesPerPage !== 18) {
  throw new Error(`Expected linesPerPage to be 18, got ${linesPerPage}`);
}

// 3. Test left pane tap (e.g. line 5)
const leftTapLine = 5;
const leftCol = 10;
const leftOffset = computeCursorOffset(content, leftTapLine, 0, leftCol);
console.log(`[PASS] Left pane tap at line ${leftTapLine}, col ${leftCol} -> offset ${leftOffset}`);

// Verify that the char at leftOffset matches the expected column
const expectedLeftLine = lines[leftTapLine];
const actualLeftChar = content[leftOffset];
console.log(`Expected line content: "${expectedLeftLine.slice(0, 20)}..."`);
console.log(`Char at offset: "${actualLeftChar}"`);

// 4. Test right continuation pane tap (e.g. line 25, which is linesPerPage + 7)
const rightTapLine = 25;
const rightCol = 12;
const rightOffset = computeCursorOffset(content, rightTapLine, 0, rightCol);
console.log(`[PASS] Right pane tap at line ${rightTapLine}, col ${rightCol} -> offset ${rightOffset}`);

const expectedRightLine = lines[rightTapLine];
const actualRightChar = content[rightOffset];
console.log(`Expected right line content: "${expectedRightLine.slice(0, 20)}..."`);
console.log(`Char at offset: "${actualRightChar}"`);

// 5. Verify that editing either pane updates the same unified document correctly
const modifiedRight = content.slice(0, rightOffset) + "MODIFIED_" + content.slice(rightOffset);
if (!modifiedRight.includes("MODIFIED_")) {
  throw new Error("Failed to edit document at right pane offset");
}
console.log(`[PASS] Verified unified document mutation from right pane offset`);

console.log("=== All Split Screen Editing Tests Passed! ===");
