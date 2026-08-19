import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const localesRoot = path.join(projectRoot, "src", "locales");
const srcRoot = path.join(projectRoot, "src");
const defaultNamespace = "common";

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

const uniq = (items) => [...new Set(items)];

const resolveDynamicCandidates = (key, namespaces, baseKeys) => {
  const parts = key.split(/\$\{[^}]+\}/g);
  const prefix = parts[0] ?? "";
  const suffix = parts.at(-1) ?? "";

  return uniq(
    namespaces.flatMap((namespace) =>
      [...baseKeys].filter(
        (candidate) =>
          candidate.startsWith(`${namespace}:${prefix}`) &&
          candidate.endsWith(suffix),
      ),
    ),
  );
};

const extractDeclaredNamespaces = (code) => {
  const namespaces = [];
  const matcher =
    /useTranslation\(\s*(?:\[\s*([\s\S]*?)\s*\]|["'`]([^"'`]+)["'`])?\s*\)/g;

  let match = matcher.exec(code);
  while (match) {
    if (match[1]) {
      const nsMatcher = /["'`]([^"'`]+)["'`]/g;
      let nsMatch = nsMatcher.exec(match[1]);
      while (nsMatch) {
        namespaces.push(nsMatch[1]);
        nsMatch = nsMatcher.exec(match[1]);
      }
    } else if (match[2]) {
      namespaces.push(match[2]);
    } else {
      namespaces.push(defaultNamespace);
    }

    match = matcher.exec(code);
  }

  return uniq(namespaces.length > 0 ? namespaces : [defaultNamespace]);
};

const extractUsedI18nKeys = (filePath, baseKeys) => {
  const code = fs.readFileSync(filePath, "utf8");
  const fileNamespaces = extractDeclaredNamespaces(code);
  const matcher = /(?:^|[^\w.])(?:i18n\.)?t\(\s*["'`]([^"'`]+)["'`]/g;
  const usedKeys = new Set();
  const unresolved = [];

  let match = matcher.exec(code);
  while (match) {
    const key = match[1];

    if (key.includes(":")) {
      usedKeys.add(key);
      match = matcher.exec(code);
      continue;
    }

    if (key.includes("${")) {
      const dynamicCandidates = resolveDynamicCandidates(
        key,
        fileNamespaces,
        baseKeys,
      );

      if (dynamicCandidates.length > 0) {
        dynamicCandidates.forEach((candidate) => usedKeys.add(candidate));
      } else {
        unresolved.push({
          filePath,
          key,
          namespaces: [...fileNamespaces],
        });
      }

      match = matcher.exec(code);
      continue;
    }

    const resolvedKey = fileNamespaces
      .map((namespace) => `${namespace}:${key}`)
      .find((candidate) => baseKeys.has(candidate));

    if (resolvedKey) {
      usedKeys.add(resolvedKey);
    } else {
      unresolved.push({
        filePath,
        key,
        namespaces: [...fileNamespaces],
      });
    }

    match = matcher.exec(code);
  }

  return {
    usedKeys: [...usedKeys],
    unresolved,
  };
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
const extracted = sourceFiles.map((filePath) =>
  extractUsedI18nKeys(filePath, baseKeys),
);

const usedKeys = new Set(extracted.flatMap((item) => item.usedKeys));
const unresolvedUnqualified = extracted
  .flatMap((item) => item.unresolved)
  .sort((left, right) =>
    left.filePath === right.filePath
      ? left.key.localeCompare(right.key)
      : left.filePath.localeCompare(right.filePath),
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

if (unresolvedUnqualified.length > 0) {
  hasIssue = true;
  console.error("\nUnresolved unqualified i18n keys:");
  for (const item of unresolvedUnqualified) {
    const relativePath = path.relative(projectRoot, item.filePath);
    const namespaceHint = item.namespaces.join(", ");
    console.error(`- ${relativePath}: "${item.key}" (namespaces: ${namespaceHint})`);
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
