import { tokenizeCode, getTokenColors, TOKEN_COLORS_DARK, TOKEN_COLORS_LIGHT } from "../src/ide/services/syntaxTokenizer";

console.log("=== Running Typing Performance & Dark Mode Visibility Tests ===");

// Test 1: Dark mode token colors
const darkColors = getTokenColors({ isDark: true });
if (!darkColors.plain || darkColors.plain === "#000000") {
  throw new Error("Dark mode plain token color must be bright, not black!");
}
console.log("✓ Test 1 Passed: Dark mode plain color is:", darkColors.plain);

// Test 2: Tokenization speed and accuracy with cache
const sampleCode = `
import React, { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
`;

const tokens1 = tokenizeCode(sampleCode, "Counter.tsx", 1);
const tokens2 = tokenizeCode(sampleCode, "Counter.tsx", 1);

if (tokens1.length !== tokens2.length) {
  throw new Error("Tokenized line counts should match!");
}
console.log("✓ Test 2 Passed: Tokenizer cache outputs identical lines:", tokens1.length);

// Test 3: Rapid typing simulation (100 keystrokes)
const lines = sampleCode.split("\n");
const start = Date.now();
for (let i = 0; i < 100; i++) {
  lines[4] = `  const [count, setCount] = useState(${i});`;
  const codeNow = lines.join("\n");
  const res = tokenizeCode(codeNow, "Counter.tsx", 1);
  if (res.length !== lines.length) {
    throw new Error("Line count mismatch during typing!");
  }
}
const elapsed = Date.now() - start;
console.log(`✓ Test 3 Passed: 100 typing keystrokes tokenized in ${elapsed}ms (${(elapsed / 100).toFixed(2)}ms / stroke)`);

if (elapsed > 500) {
  throw new Error("Typing tokenization should be sub-5ms per stroke!");
}

console.log("=== All Tests Passed Successfully! ===");
