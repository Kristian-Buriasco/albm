import type { APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { GalleryRow, PhotoRow } from './env';

export async function adminLogin(
  request: APIRequestContext,
  baseUrl: string,
  password: string,
): Promise<void> {
  const res = await request.post(`${baseUrl}/api/admin/login`, {
    data: { password },
  });
  if (!res.ok()) {
    throw new Error(`Admin login failed: ${res.status()} ${await res.text()}`);
  }
}

export async function createGallery(
  request: APIRequestContext,
  baseUrl: string,
  body: Record<string, unknown>,
): Promise<GalleryRow> {
  const res = await request.post(`${baseUrl}/api/admin/galleries`, { data: body });
  if (!res.ok()) {
    throw new Error(`Create gallery failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function patchGallery(
  request: APIRequestContext,
  baseUrl: string,
  id: string,
  body: Record<string, unknown>,
): Promise<GalleryRow> {
  const res = await request.patch(`${baseUrl}/api/admin/galleries/${id}`, { data: body });
  if (!res.ok()) {
    throw new Error(`Patch gallery failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function uploadPhoto(
  request: APIRequestContext,
  baseUrl: string,
  galleryId: string,
  filePath: string,
): Promise<PhotoRow> {
  const res = await request.post(`${baseUrl}/api/admin/galleries/${galleryId}/photos`, {
    multipart: {
      file: fs.createReadStream(filePath),
    },
  });
  if (!res.ok()) {
    throw new Error(`Upload failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
}

export async function waitForPhotoReady(
  request: APIRequestContext,
  baseUrl: string,
  galleryId: string,
  photoId: string,
  timeoutMs = 60_000,
): Promise<PhotoRow> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`${baseUrl}/api/admin/galleries/${galleryId}/photos`);
    if (res.ok()) {
      const photos = (await res.json()) as PhotoRow[];
      const photo = photos.find((p) => p.id === photoId);
      if (photo?.status === 'ready') return photo;
      if (photo?.status === 'error') throw new Error(`Photo ${photoId} processing failed`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Photo ${photoId} not ready within ${timeoutMs}ms`);
}

export async function unlockGallery(
  request: APIRequestContext,
  baseUrl: string,
  slug: string,
  body: { password?: string; pin?: string },
): Promise<void> {
  const res = await request.post(`${baseUrl}/api/g/${slug}/unlock`, { data: body });
  if (!res.ok()) {
    throw new Error(`Unlock failed: ${res.status()} ${await res.text()}`);
  }
}

export async function ensureVisitor(
  request: APIRequestContext,
  baseUrl: string,
  slug: string,
): Promise<void> {
  const res = await request.post(`${baseUrl}/api/g/${slug}/visitor`, { data: {} });
  if (!res.ok() && res.status() !== 201) {
    throw new Error(`Visitor create failed: ${res.status()} ${await res.text()}`);
  }
}

export async function favoritePhoto(
  request: APIRequestContext,
  baseUrl: string,
  slug: string,
  photoId: string,
): Promise<void> {
  const res = await request.post(`${baseUrl}/api/g/${slug}/selections`, {
    data: { photoId },
  });
  if (!res.ok()) {
    throw new Error(`Favorite failed: ${res.status()} ${await res.text()}`);
  }
}

export function tempImagePath(name: string): string {
  return path.join(process.cwd(), 'e2e', '.tmp', name);
}
