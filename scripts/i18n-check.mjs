import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const localesRoot = path.join(projectRoot, "src", "locales");
const srcRoot = path.join(projectRoot, "src");

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

const readJson = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  const normalized = raw.replace(/^\uFEFF/, "");
  return JSON.parse(normalized);
};

const getLocaleNamespaces = (language) => {
  const dir = path.join(localesRoot, language);
  if (!fs.existsSync(dir)) return {};

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  return Object.fromEntries(
    files.map((fileName) => {
      const namespace = fileName.replace(/\.json$/i, "");
      const json = readJson(path.join(dir, fileName));
      const flattened = flattenObject(json);
      const keys = Object.keys(flattened).map((key) => `${namespace}:${key}`);
      return [namespace, new Set(keys)];
    }),
  );
};

const walkFiles = (root, allowExt = [".ts", ".tsx"]) => {
  const result = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkFiles(fullPath, allowExt));
      continue;
    }
    if (allowExt.some((ext) => fullPath.endsWith(ext))) {
      result.push(fullPath);
    }
  }
  return result;
};

const extractUsedI18nKeys = (filePath) => {
  const code = fs.readFileSync(filePath, "utf8");
  const matcher = /(?:^|[^\w.])(?:i18n\.)?t\(\s*["'`]([^"'`]+)["'`]/g;
  const keys = [];

  let match = matcher.exec(code);
  while (match) {
    const key = match[1];
    if (key.includes(":")) {
      keys.push(key);
    }
    match = matcher.exec(code);
  }

  return keys;
};

const languages = fs
  .readdirSync(localesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (languages.length === 0) {
  console.error("No locale directories found in src/locales");
  process.exit(1);
}

const localeMaps = Object.fromEntries(
  languages.map((language) => [language, getLocaleNamespaces(language)]),
);

const baseLanguage = languages.includes("en") ? "en" : languages[0];
const baseNamespaces = localeMaps[baseLanguage];

const baseKeys = new Set(
  Object.values(baseNamespaces).flatMap((set) => [...set.values()]),
);

const sourceFiles = walkFiles(srcRoot);
const usedKeys = new Set(
  sourceFiles.flatMap((filePath) => extractUsedI18nKeys(filePath)),
);

const missingKeys = [...usedKeys].filter((key) => !baseKeys.has(key)).sort();
const unusedKeys = [...baseKeys].filter((key) => !usedKeys.has(key)).sort();

const missingInLanguages = [];
for (const language of languages) {
  if (language === baseLanguage) continue;

  const namespaceMap = localeMaps[language];
  const languageKeys = new Set(
    Object.values(namespaceMap).flatMap((set) => [...set.values()]),
  );
  const missingForLanguage = [...baseKeys]
    .filter((key) => !languageKeys.has(key))
    .sort();

  if (missingForLanguage.length > 0) {
    missingInLanguages.push({ language, keys: missingForLanguage });
  }
}

let hasIssue = false;

if (missingKeys.length > 0) {
  hasIssue = true;
  console.error("\nMissing i18n keys (used in code but not defined):");
  for (const key of missingKeys) {
    console.error(`- ${key}`);
  }
}

if (missingInLanguages.length > 0) {
  hasIssue = true;
  console.error("\nMissing translation keys by language:");
  for (const item of missingInLanguages) {
    console.error(`\n[${item.language}]`);
    for (const key of item.keys) {
      console.error(`- ${key}`);
    }
  }
}

if (unusedKeys.length > 0) {
  console.warn("\nUnused keys (defined but not referenced):");
  for (const key of unusedKeys) {
    console.warn(`- ${key}`);
  }
}

if (!hasIssue) {
  console.log("i18n check passed.");
}

process.exit(hasIssue ? 1 : 0);
