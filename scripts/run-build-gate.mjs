import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { verifyDistAssets } from "./verify-dist-assets.mjs";

const child = spawn("npm run build", {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
});

let combinedOutput = "";

const forward = (stream, writer) => {
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    combinedOutput += text;
    writer.write(chunk);
  });
};

const toKb = (bytes) => Math.round((bytes / 1024) * 100) / 100;

const getAssetBudget = (file) => {
  const isWorker = /(?:^|[.-])worker(?:[.-]|$)/i.test(file);
  if (isWorker) {
    return {
      kind: "worker",
      maxRawKb: 1500,
      maxGzipKb: 450,
    };
  }

  if (/^index-[\w-]+\.js$/.test(file)) {
    return {
      kind: "entry",
      maxRawKb: 650,
      maxGzipKb: 200,
    };
  }

  return {
    kind: "chunk",
    maxRawKb: 500,
    maxGzipKb: 175,
  };
};

forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

child.on("close", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const forbiddenWarnings = [/Circular chunk:/i];
  const matchedWarning = forbiddenWarnings.find((regex) =>
    regex.test(combinedOutput),
  );

  if (matchedWarning) {
    console.error(
      `Build gate failed: forbidden build warning matched ${matchedWarning}`,
    );
    process.exit(1);
  }

  const assetsDir = join(process.cwd(), "dist", "assets");
  const jsAssets = readdirSync(assetsDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => {
      const assetPath = join(assetsDir, file);
      return {
        file,
        rawKb: toKb(statSync(assetPath).size),
        gzipKb: toKb(gzipSync(readFileSync(assetPath)).length),
        budget: getAssetBudget(file),
      };
    });

  const oversizedAssets = jsAssets.filter(
    (asset) =>
      asset.rawKb > asset.budget.maxRawKb ||
      asset.gzipKb > asset.budget.maxGzipKb,
  );

  if (oversizedAssets.length > 0) {
    console.error("Build gate failed: JS asset exceeded its raw/gzip budget.");
    oversizedAssets.forEach((asset) => {
      console.error(
        `- ${asset.file} (${asset.budget.kind}): ${asset.rawKb} kB raw / ${asset.gzipKb} kB gzip; budget ${asset.budget.maxRawKb} kB raw / ${asset.budget.maxGzipKb} kB gzip`,
      );
    });
    process.exit(1);
  }

  try {
    const verification = verifyDistAssets();
    console.log(
      `Dist asset verification passed. Checked ${verification.scannedFiles} built file(s).`,
    );
  } catch (error) {
    console.error(error.message);
    for (const failure of error.failures ?? []) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
});
