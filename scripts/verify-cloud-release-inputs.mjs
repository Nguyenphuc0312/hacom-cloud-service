import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_SHARED_TYPES_SHA =
  "8f5effe8be115e69b0d0cb7f4a79f36ec5c14bc4";
const sharedTypesDir = resolve(process.cwd(), "../chat-shared-types");

if (!existsSync(resolve(sharedTypesDir, "dist/index.js"))) {
  throw new Error(
    "@hacom/chat-shared-types dist is missing. Build the pinned sibling worktree first.",
  );
}

const actualSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: sharedTypesDir,
  encoding: "utf8",
}).trim();

if (actualSha !== EXPECTED_SHARED_TYPES_SHA) {
  throw new Error(
    `Unexpected Shared Types revision: ${actualSha}; expected ${EXPECTED_SHARED_TYPES_SHA}`,
  );
}

console.log(`Cloud release inputs verified: @hacom/chat-shared-types ${actualSha}`);
