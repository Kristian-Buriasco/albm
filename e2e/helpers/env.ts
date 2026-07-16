import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export type TestEnv = {
  password: string;
  baseUrl: string;
  dataDir: string;
};

export function loadTestEnv(): TestEnv {
  const raw = fs.readFileSync(path.join(process.cwd(), 'e2e', '.test-env.json'), 'utf8');
  return JSON.parse(raw) as TestEnv;
}

export async function makeTestJpeg(filePath: string, color: { r: number; g: number; b: number }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const svg = `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="600" fill="rgb(${color.r},${color.g},${color.b})"/>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(filePath);
}

export type GalleryRow = {
  id: string;
  slug: string;
  title: string;
  watermarkEnabled?: boolean;
  downloadEnabled?: boolean;
  showExif?: boolean;
  folderId?: string | null;
};

export type PhotoRow = {
  id: string;
  filename: string;
  status: string;
};
