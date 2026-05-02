import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve(process.cwd(), 'dist');
const htmlPath = path.join(distDir, 'index.html');
const assetPattern = /(?:\/)?assets\/[A-Za-z0-9._-]+\.(?:js|css|png|svg|gif|webp|ico|woff2?|ttf|eot)/g;
const queue = [];
const queued = new Set();
const scanned = new Set();
const discoveredAssets = new Set();
const missingAssets = new Set();

const assertExists = (targetPath, description) => {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} was not found: ${targetPath}`);
  }
};

const toAbsoluteAssetPath = (assetRef) => {
  const normalized = assetRef.replace(/^\/+/, '');
  return path.join(distDir, normalized);
};

const enqueueIfScannable = (assetRef) => {
  if (!/\.(?:js|css)$/i.test(assetRef)) {
    return;
  }

  if (!queued.has(assetRef)) {
    queued.add(assetRef);
    queue.push(assetRef);
  }
};

const collectAssetRefs = (content) => {
  const matches = content.match(assetPattern) ?? [];
  for (const match of matches) {
    const normalized = match.replace(/^\/+/, '');
    discoveredAssets.add(normalized);
    enqueueIfScannable(normalized);
  }
};

assertExists(distDir, 'dist directory');
assertExists(htmlPath, 'dist/index.html');

collectAssetRefs(fs.readFileSync(htmlPath, 'utf8'));

if (!Array.from(discoveredAssets).some((asset) => asset.endsWith('.js'))) {
  throw new Error('dist/index.html does not reference any built JavaScript asset under /assets/.');
}

if (!Array.from(discoveredAssets).some((asset) => asset.endsWith('.css'))) {
  throw new Error('dist/index.html does not reference any built CSS asset under /assets/.');
}

while (queue.length > 0) {
  const assetRef = queue.shift();
  if (!assetRef || scanned.has(assetRef)) {
    continue;
  }

  scanned.add(assetRef);

  const assetPath = toAbsoluteAssetPath(assetRef);
  if (!fs.existsSync(assetPath)) {
    missingAssets.add(assetRef);
    continue;
  }

  const content = fs.readFileSync(assetPath, 'utf8');
  collectAssetRefs(content);
}

for (const assetRef of discoveredAssets) {
  const assetPath = toAbsoluteAssetPath(assetRef);
  if (!fs.existsSync(assetPath)) {
    missingAssets.add(assetRef);
  }
}

if (missingAssets.size > 0) {
  const missingList = Array.from(missingAssets).sort().join('\n- ');
  throw new Error(`Built bundle references missing assets:\n- ${missingList}`);
}

process.stdout.write(
  `Verified ${discoveredAssets.size} asset reference(s) under ${path.relative(process.cwd(), distDir)}.\n`,
);
