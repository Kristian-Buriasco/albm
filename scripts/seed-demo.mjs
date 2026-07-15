#!/usr/bin/env node
/**
 * Seed demo galleries and photos for README screenshots.
 * Usage: node scripts/seed-demo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

const BASE = process.env.BASE_URL ?? 'http://localhost:3200';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo123';
const COOKIE = '/tmp/gallery-demo-cookies.txt';

const COLORS = [
  { r: 30, g: 58, b: 95 },
  { r: 180, g: 83, b: 9 },
  { r: 22, g: 101, b: 52 },
  { r: 127, g: 29, b: 29 },
  { r: 88, g: 28, b: 135 },
  { r: 15, g: 118, b: 110 },
];

async function api(method, urlPath, body, isForm = false) {
  const headers = {};
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: payload,
    redirect: 'manual',
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status}: ${text}`);
  return data;
}

function curlLogin() {
  execSync(
    `curl -s -c ${COOKIE} -b ${COOKIE} -X POST ${BASE}/api/admin/login -H "Content-Type: application/json" -d '{"password":"${PASSWORD}"}'`,
    { stdio: 'inherit' },
  );
}

async function apiWithCookie(method, urlPath, body) {
  const tmp = `/tmp/gallery-body-${Date.now()}.json`;
  if (body !== undefined) fs.writeFileSync(tmp, JSON.stringify(body));
  const dataFlag = body !== undefined ? `-d @${tmp}` : '';
  const out = execSync(
    `curl -s -b ${COOKIE} -X ${method} ${BASE}${urlPath} -H "Content-Type: application/json" ${dataFlag}`,
    { encoding: 'utf8' },
  );
  if (body !== undefined) fs.unlinkSync(tmp);
  return out ? JSON.parse(out) : null;
}

async function uploadPhoto(galleryId, filePath) {
  const out = execSync(
    `curl -s -b ${COOKIE} -X POST ${BASE}/api/admin/galleries/${galleryId}/photos -F "file=@${filePath}"`,
    { encoding: 'utf8' },
  );
  return JSON.parse(out);
}

async function makeImages(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  for (let i = 0; i < COLORS.length; i++) {
    const c = COLORS[i];
    const c2 = { r: clamp(c.r + 55), g: clamp(c.g + 45), b: clamp(c.b + 70) };
    const file = path.join(dir, `demo-${i + 1}.jpg`);
    // Tasteful diagonal gradient — reads as abstract photography, no text.
    const svg = `<svg width="1600" height="1067" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgb(${c.r},${c.g},${c.b})"/>
        <stop offset="60%" stop-color="rgb(${c2.r},${c2.g},${c2.b})"/>
        <stop offset="100%" stop-color="rgb(${clamp(c.r - 20)},${clamp(c.g - 20)},${clamp(c.b - 10)})"/>
      </linearGradient></defs>
      <rect width="1600" height="1067" fill="url(#g)"/>
    </svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(file);
    files.push(file);
  }
  return files;
}

async function waitForPhotos(galleryId) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const dbCheck = execSync(
        `sqlite3 demo-data/gallery.db "SELECT count(*) FROM photos WHERE gallery_id='${galleryId}' AND status='processing';"`,
        { cwd: path.dirname(new URL(import.meta.url).pathname.replace('/scripts/seed-demo.mjs', '')), encoding: 'utf8' },
      ).trim();
      if (dbCheck === '0') return;
    } catch {
      /* sqlite3 may be unavailable */
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

  const portfolio1 = await apiWithCookie('POST', '/api/admin/galleries', {
    title: 'FC Leuven — Cup Final',
    type: 'portfolio',
    published: true,
    featured: true,
    showLocation: true,
    locationName: 'Den Dreef, Leuven',
    sortOrder: 1,
  });
  const portfolio2 = await apiWithCookie('POST', '/api/admin/galleries', {
    title: 'Track & Field Championships',
    type: 'portfolio',
    published: true,
    featured: true,
    showLocation: true,
    locationName: 'King Baudouin Stadium',
    sortOrder: 2,
  });
  const portfolio3 = await apiWithCookie('POST', '/api/admin/galleries', {
    title: 'Night Run Leuven',
    type: 'portfolio',
    published: true,
    featured: false,
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
  });

  const galleries = [
    { g: portfolio1, count: 4 },
    { g: portfolio2, count: 3 },
    { g: portfolio3, count: 2 },
    { g: client, count: 6 },
  ];

  const allPhotoIds = {};
  for (const { g, count } of galleries) {
    const id = g.id ?? g.gallery?.id ?? g;
    console.log(`Uploading to ${id}…`);
    const ids = [];
    for (let i = 0; i < count; i++) {
      const photo = await uploadPhoto(id, images[i % images.length]);
      ids.push(photo.id);
    }
    allPhotoIds[id] = ids;
    console.log(`Waiting for processing (${id})…`);
    await new Promise((r) => setTimeout(r, 8000));
    await apiWithCookie('PATCH', `/api/admin/galleries/${id}`, {
      coverPhotoId: ids[0],
      published: true,
    });
  }

  await apiWithCookie('PATCH', `/api/admin/galleries/${portfolio1.id}`, {
    featured: true,
    published: true,
  });
  await apiWithCookie('PATCH', `/api/admin/galleries/${portfolio2.id}`, {
    featured: true,
    published: true,
  });

  fs.writeFileSync(
    path.join(process.cwd(), 'demo-data', 'seed-info.json'),
    JSON.stringify(
      {
        portfolio1: portfolio1.slug ?? portfolio1,
        portfolio2: portfolio2.slug ?? portfolio2,
        client: client.slug ?? client,
        clientId: client.id ?? client,
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
