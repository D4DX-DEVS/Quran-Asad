// Uploads app images to DigitalOcean Spaces so they ship from the CDN instead
// of inside the Flutter bundle.
//
//   node scripts/upload-images.js <file|dir> [more...]
//
// Files land under `<DO_SPACES_FOLDER>/images/<basename>` and are made public,
// so the app can fetch them without credentials. Re-running overwrites.

import path from 'node:path';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { config, assertSpacesConfig } from '../src/config.js';

try {
  assertSpacesConfig();
} catch (e) {
  console.error(`${e.message} Add them to .env first.`);
  process.exit(1);
}

const {
  key: accessKeyId,
  secret: secretAccessKey,
  endpoint,
  cdnEndpoint,
  bucket,
  folder,
} = config.spaces;

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('Usage: node scripts/upload-images.js <file|dir> [more...]');
  process.exit(1);
}

const CONTENT_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
};

// Only images — fonts and data files stay in the app bundle.
const expand = (target) => {
  const stat = statSync(target);
  if (!stat.isDirectory()) return [target];
  return readdirSync(target)
    .map((name) => path.join(target, name))
    .filter((file) => statSync(file).isFile());
};

const files = targets
  .flatMap(expand)
  .filter((file) => CONTENT_TYPES[path.extname(file).toLowerCase()]);

if (files.length === 0) {
  console.error('No image files matched.');
  process.exit(1);
}

// DigitalOcean Spaces speaks the S3 API; the region is embedded in the endpoint
// but the SDK still requires one to be set.
const client = new S3Client({
  endpoint,
  region: endpoint.split('.')[0].replace(/^https?:\/\//, ''),
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: false,
});

const publicBase = (cdnEndpoint ?? endpoint).replace(/\/+$/, '');

for (const file of files) {
  const key = [folder, 'images', path.basename(file)].filter(Boolean).join('/');
  const body = readFileSync(file);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ACL: 'public-read',
      ContentType: CONTENT_TYPES[path.extname(file).toLowerCase()],
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const kb = (body.length / 1024).toFixed(0).padStart(5);
  console.log(`${kb} KB  ${publicBase}/${key}`);
}

console.log(`\ndone — ${files.length} image(s)`);
