import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const localeDir = path.join(projectRoot, "src", "locales", "vi");
const outputPath = path.join(projectRoot, "src", "locales", "translation-keys.json");

const flattenObject = (value, parent = "", out = {}) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const next = parent ? `${parent}.${key}` : key;
      flattenObject(nested, next, out);
    }
    return out;
  }

  out[parent] = value;
  return out;
};

if (!fs.existsSync(localeDir)) {
  console.error("Missing locale source directory:", localeDir);
  process.exit(1);
}

const files = fs
  .readdirSync(localeDir)
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();

const exported = {};
for (const fileName of files) {
  const namespace = fileName.replace(/\.json$/i, "");
  const filePath = path.join(localeDir, fileName);
  const raw = fs.readFileSync(filePath, "utf8");
  const content = JSON.parse(raw.replace(/^\uFEFF/, ""));
  exported[namespace] = Object.keys(flattenObject(content)).sort();
}

fs.writeFileSync(outputPath, `${JSON.stringify(exported, null, 2)}\n`, "utf8");
console.log("Exported translation keys to", outputPath);
