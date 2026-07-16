#!/usr/bin/env node
/**
 * Seed demo galleries and photos for README screenshots.
 * Usage: node scripts/seed-demo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo123';
const COOKIE = '/tmp/gallery-demo-cookies.txt';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.join(ROOT, 'demo-data', 'gallery.db');

/** Distinct photographic-atmosphere gradients — not solid swatches. */
const GRADIENTS = [
  {
    name: 'dusk-gradient.jpg',
    stops: [
      { offset: '0%', color: 'rgb(28, 42, 78)' },
      { offset: '45%', color: 'rgb(156, 78, 92)' },
      { offset: '100%', color: 'rgb(212, 148, 98)' },
    ],
    x1: '0',
    y1: '0',
    x2: '1',
    y2: '0.85',
  },
  {
    name: 'teal-wash.jpg',
    stops: [
      { offset: '0%', color: 'rgb(12, 74, 82)' },
      { offset: '55%', color: 'rgb(45, 140, 132)' },
      { offset: '100%', color: 'rgb(180, 210, 198)' },
    ],
    x1: '0.1',
    y1: '1',
    x2: '0.9',
    y2: '0',
  },
  {
    name: 'amber-field.jpg',
    stops: [
      { offset: '0%', color: 'rgb(92, 58, 22)' },
      { offset: '40%', color: 'rgb(180, 118, 42)' },
      { offset: '100%', color: 'rgb(240, 210, 150)' },
    ],
    x1: '0',
    y1: '0.2',
    x2: '1',
    y2: '1',
  },
  {
    name: 'slate-horizon.jpg',
    stops: [
      { offset: '0%', color: 'rgb(45, 52, 64)' },
      { offset: '50%', color: 'rgb(98, 112, 128)' },
      { offset: '100%', color: 'rgb(198, 206, 214)' },
    ],
    x1: '0.5',
    y1: '0',
    x2: '0.5',
    y2: '1',
  },
  {
    name: 'crimson-haze.jpg',
    stops: [
      { offset: '0%', color: 'rgb(72, 18, 28)' },
      { offset: '50%', color: 'rgb(148, 48, 58)' },
      { offset: '100%', color: 'rgb(210, 130, 110)' },
    ],
    x1: '0',
    y1: '0',
    x2: '0.8',
    y2: '1',
  },
  {
    name: 'forest-mist.jpg',
    stops: [
      { offset: '0%', color: 'rgb(18, 48, 36)' },
      { offset: '45%', color: 'rgb(48, 98, 68)' },
      { offset: '100%', color: 'rgb(160, 188, 150)' },
    ],
    x1: '1',
    y1: '0',
    x2: '0',
    y2: '1',
  },
];

function curlLogin() {
  fs.rmSync(COOKIE, { force: true });
  const out = execSync(
    `curl -s -c ${COOKIE} -b ${COOKIE} -X POST ${BASE}/api/admin/login -H "Content-Type: application/json" -d '{"password":"${PASSWORD}"}'`,
    { encoding: 'utf8' },
  );
  const data = out ? JSON.parse(out) : null;
  if (!data || data.error) {
    throw new Error(`Login failed: ${out}`);
  }
  console.log('Logged in');
}

function galleryId(g) {
  const id = g?.id ?? g?.gallery?.id;
  if (typeof id !== 'string' || !id) {
    throw new Error(`Unexpected gallery response: ${JSON.stringify(g)}`);
  }
  return id;
}

async function apiWithCookie(method, urlPath, body) {
  const tmp = `/tmp/gallery-body-${Date.now()}.json`;
  if (body !== undefined) fs.writeFileSync(tmp, JSON.stringify(body));
  const dataFlag = body !== undefined ? `-d @${tmp}` : '';
  const out = execSync(
    `curl -s -b ${COOKIE} -w "\\n%{http_code}" -X ${method} ${BASE}${urlPath} -H "Content-Type: application/json" ${dataFlag}`,
    { encoding: 'utf8' },
  );
  if (body !== undefined) fs.unlinkSync(tmp);
  const nl = out.lastIndexOf('\n');
  const text = nl >= 0 ? out.slice(0, nl) : out;
  const code = Number(nl >= 0 ? out.slice(nl + 1) : '0');
  const data = text ? JSON.parse(text) : null;
  if (code >= 400 || data?.error) {
    throw new Error(`${method} ${urlPath} → ${code}: ${text}`);
  }
  return data;
}

async function uploadPhoto(galleryId, filePath) {
  const out = execSync(
    `curl -s -b ${COOKIE} -X POST ${BASE}/api/admin/galleries/${galleryId}/photos -F "file=@${filePath}"`,
    { encoding: 'utf8' },
  );
  const data = JSON.parse(out);
  if (!data?.id) throw new Error(`Upload failed: ${out}`);
  return data;
}

async function makeImages(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const g of GRADIENTS) {
    const stopXml = g.stops
      .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`)
      .join('');
    const file = path.join(dir, g.name);
    const svg = `<svg width="1600" height="1067" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">
        ${stopXml}
      </linearGradient></defs>
      <rect width="1600" height="1067" fill="url(#g)"/>
    </svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(file);
    files.push(file);
  }
  return files;
}

async function waitForPhotos(galleryId) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const dbCheck = execSync(
        `sqlite3 "${DB_PATH}" "SELECT count(*) FROM photos WHERE gallery_id='${galleryId}' AND status='processing';"`,
        { encoding: 'utf8' },
      ).trim();
      if (dbCheck === '0') return;
    } catch {
      if (i > 20) return;
    }
  }
}

async function main() {
  const imgDir = path.join(process.cwd(), 'demo-data', 'seed-images');
  console.log('Generating demo images…');
  const images = await makeImages(imgDir);

  console.log('Logging in…');
  curlLogin();

  console.log('Updating site settings…');
  await apiWithCookie('POST', '/api/admin/settings', {
    homeEyebrow: 'Sport & event photographer',
    homeHeadline: 'The moment, kept.',
    homeIntro:
      'Based in Leuven, Belgium. Covering football, athletics, and live events with a focus on decisive moments.',
    footerContent: '© Kristian Buriasco · Leuven, Belgium',
    contactEmail: 'hello@example.com',
    contactInstagram: 'kristianburiasco',
  });

  const y2025 = Date.UTC(2025, 5, 14);
  const y2026 = Date.UTC(2026, 2, 22);

  const portfolio1 = await apiWithCookie('POST', '/api/admin/galleries', {
    title: 'FC Leuven — Cup Final',
    type: 'portfolio',
    published: true,
    featured: true,
    showLocation: true,
    locationName: 'Den Dreef, Leuven',
    eventDate: y2026,
    sortOrder: 1,
  });
  const portfolio2 = await apiWithCookie('POST', '/api/admin/galleries', {
    title: 'Track & Field Championships',
    type: 'portfolio',
    published: true,
    featured: true,
    showLocation: true,
    locationName: 'King Baudouin Stadium',
    eventDate: y2025,
    sortOrder: 2,
  });
  const portfolio3 = await apiWithCookie('POST', '/api/admin/galleries', {
    title: 'Night Run Leuven',
    type: 'portfolio',
    published: true,
    featured: false,
    eventDate: y2026,
    sortOrder: 3,
  });

  const client = await apiWithCookie('POST', '/api/admin/galleries', {
    title: 'ACME Corp — Team Photos 2026',
    type: 'client',
    published: true,
    downloadEnabled: true,
    favoritesDownloadEnabled: true,
    commentsMode: 'post',
    clientInfoMode: 'optional',
    showExif: true,
    showLocation: true,
    locationName: 'Sportcomplex De Schalk',
    limitSelections: true,
    selectionLimit: 20,
    downloadOfferWeb: true,
    downloadOfferPrint: true,
    downloadOfferOriginal: true,
  });

  const galleries = [
    { g: portfolio1, count: 4 },
    { g: portfolio2, count: 3 },
    { g: portfolio3, count: 2 },
    { g: client, count: 6 },
  ];

  for (const { g, count } of galleries) {
    const id = galleryId(g);
    console.log(`Uploading to ${g.title ?? id}…`);
    const ids = [];
    for (let i = 0; i < count; i++) {
      const photo = await uploadPhoto(id, images[i % images.length]);
      ids.push(photo.id);
    }
    console.log(`Waiting for processing (${id})…`);
    await waitForPhotos(id);
    await new Promise((r) => setTimeout(r, 2000));
    await apiWithCookie('PATCH', `/api/admin/galleries/${id}`, {
      coverPhotoId: ids[0],
      published: true,
    });
  }

  const p1 = galleryId(portfolio1);
  const p2 = galleryId(portfolio2);
  const clientId = galleryId(client);

  await apiWithCookie('PATCH', `/api/admin/galleries/${p1}`, {
    featured: true,
    published: true,
  });
  await apiWithCookie('PATCH', `/api/admin/galleries/${p2}`, {
    featured: true,
    published: true,
  });

  fs.writeFileSync(
    path.join(process.cwd(), 'demo-data', 'seed-info.json'),
    JSON.stringify(
      {
        portfolio1: portfolio1.slug,
        portfolio2: portfolio2.slug,
        client: client.slug,
        clientId,
      },
      null,
      2,
    ),
  );

  console.log('Done. Client slug saved to demo-data/seed-info.json');
  console.log(JSON.stringify({ portfolio1, portfolio2, client }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
