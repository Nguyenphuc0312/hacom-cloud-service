import { readdirSync, statSync } from "node:fs";
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
    // pdf.worker is a separately loaded third-party worker and is not part of
    // the initial application bundle budget.
    .filter((file) => !file.startsWith("pdf.worker."))
    .map((file) => ({
      file,
      sizeKb: Math.round((statSync(join(assetsDir, file)).size / 1024) * 100) / 100,
    }));

  const maxAssetSizeKb = 800;
  const oversizedAssets = jsAssets.filter(
    (asset) => asset.sizeKb > maxAssetSizeKb,
  );

  if (oversizedAssets.length > 0) {
    console.error(
      `Build gate failed: JS asset exceeds ${maxAssetSizeKb} kB raw budget.`,
    );
    oversizedAssets.forEach((asset) => {
      console.error(`- ${asset.file}: ${asset.sizeKb} kB`);
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
