import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, normalize, relative, resolve } from "node:path";

const DIST_DIR = resolve(process.cwd(), "dist");
const ASSET_REFERENCE_REGEX =
  /(?:["'`(=:\s])((?:\/assets\/|\.\/)[^"'`\s)]+?\.(?:js|css))(?:["'`)\s]|$)/g;
const SCAN_EXTENSIONS = new Set([".html", ".js", ".css"]);

const normalizeSlashes = (value) => value.replaceAll("\\", "/");

const walkFiles = (dir, files = []) => {
  for (const entry of readdirSync(dir)) {
    const absolutePath = join(dir, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      walkFiles(absolutePath, files);
      continue;
    }

    if (SCAN_EXTENSIONS.has(extname(entry))) {
      files.push(absolutePath);
    }
  }

  return files;
};

const resolveReferencedAsset = (sourceFile, reference) => {
  if (reference.startsWith("/assets/")) {
    return join(DIST_DIR, reference.slice(1));
  }

  if (reference.startsWith("./")) {
    return resolve(sourceFile, "..", reference);
  }

  return null;
};

export const verifyDistAssets = () => {
  if (!existsSync(DIST_DIR)) {
    throw new Error(`Missing dist directory: ${DIST_DIR}`);
  }

  const failures = [];
  const scannedFiles = walkFiles(DIST_DIR);

  for (const file of scannedFiles) {
    const content = readFileSync(file, "utf8");
    const sourceLabel = normalizeSlashes(relative(DIST_DIR, file));

    for (const match of content.matchAll(ASSET_REFERENCE_REGEX)) {
      const reference = match[1];
      const resolvedAsset = resolveReferencedAsset(file, reference);

      if (!resolvedAsset) {
        continue;
      }

      if (!existsSync(normalize(resolvedAsset))) {
        failures.push(
          `${sourceLabel} references missing asset ${reference}`,
        );
      }
    }
  }

  if (failures.length > 0) {
    const error = new Error(
      `Dist asset verification failed with ${failures.length} missing reference(s).`,
    );
    error.failures = failures;
    throw error;
  }

  return {
    distDir: DIST_DIR,
    scannedFiles: scannedFiles.length,
  };
};

const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === import.meta.filename;

if (isDirectExecution) {
  try {
    const result = verifyDistAssets();
    console.log(
      `Dist asset verification passed. Checked ${result.scannedFiles} file(s) in ${normalizeSlashes(
        relative(process.cwd(), result.distDir) || "dist",
      )}.`,
    );
  } catch (error) {
    console.error(error.message);
    for (const failure of error.failures ?? []) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}
