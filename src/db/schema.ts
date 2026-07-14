import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  unique,
  index,
} from 'drizzle-orm/sqlite-core';

const timestamps = {
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer('updated_at')
    .notNull()
    .$defaultFn(() => Date.now()),
};

export const galleries = sqliteTable('galleries', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  type: text('type', { enum: ['client', 'portfolio'] }).notNull(),
  title: text('title').notNull(),
  eventDate: integer('event_date'),
  passwordHash: text('password_hash'),
  clientInfoMode: text('client_info_mode', {
    enum: ['off', 'optional', 'required'],
  })
    .notNull()
    .default('off'),
  watermarkEnabled: integer('watermark_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  watermarkPosition: text('watermark_position', {
    enum: ['br', 'bl', 'tr', 'tl', 'center'],
  })
    .notNull()
    .default('br'),
  watermarkOpacity: integer('watermark_opacity').notNull().default(70),
  watermarkScale: integer('watermark_scale').notNull().default(25),
  downloadEnabled: integer('download_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  favoritesDownloadEnabled: integer('favorites_download_enabled', {
    mode: 'boolean',
  })
    .notNull()
    .default(false),
  selectionExportEnabled: integer('selection_export_enabled', {
    mode: 'boolean',
  })
    .notNull()
    .default(true),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
  showLikeCounts: integer('show_like_counts', { mode: 'boolean' })
    .notNull()
    .default(false),
  showExif: integer('show_exif', { mode: 'boolean' }).notNull().default(false),
  showLocation: integer('show_location', { mode: 'boolean' })
    .notNull()
    .default(false),
  locationName: text('location_name'),
  locationLat: text('location_lat'),
  locationLng: text('location_lng'),
  commentsMode: text('comments_mode', { enum: ['off', 'post', 'pre'] })
    .notNull()
    .default('off'),
  expiresAt: integer('expires_at'),
  autoExpire: integer('auto_expire', { mode: 'boolean' }).notNull().default(false),
  selectionLimit: integer('selection_limit'),
  limitSelections: integer('limit_selections', { mode: 'boolean' })
    .notNull()
    .default(false),
  trackDownloads: integer('track_downloads', { mode: 'boolean' })
    .notNull()
    .default(true),
  socialPreview: integer('social_preview', { mode: 'boolean' })
    .notNull()
    .default(false),
  coverPhotoId: text('cover_photo_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const sections = sqliteTable('sections', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').references(() => sections.id, {
      onDelete: 'set null',
    }),
    filename: text('filename').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status', { enum: ['processing', 'ready', 'error'] })
      .notNull()
      .default('processing'),
    exif: text('exif'),
    capturedAt: integer('captured_at'),
    ...timestamps,
  },
  (t) => [unique().on(t.galleryId, t.filename)],
);

export const visitors = sqliteTable('visitors', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  name: text('name'),
  email: text('email'),
  sessionToken: text('session_token').notNull().unique(),
  ...timestamps,
});

export const selections = sqliteTable(
  'selections',
  {
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [primaryKey({ columns: [t.photoId, t.visitorId] })],
);

export const likes = sqliteTable(
  'likes',
  {
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    likerToken: text('liker_token').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [primaryKey({ columns: [t.photoId, t.likerToken] })],
);

export const viewEvents = sqliteTable(
  'view_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id'),
    kind: text('kind').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [index('view_events_gallery_created_idx').on(t.galleryId, t.createdAt)],
);

export const downloadEvents = sqliteTable('download_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  galleryId: text('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  photoId: text('photo_id'),
  visitorId: text('visitor_id'),
  kind: text('kind', { enum: ['photo', 'zip', 'favorites_zip'] }).notNull(),
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  visitorId: text('visitor_id'),
  commenterToken: text('commenter_token'),
  authorName: text('author_name').notNull(),
  body: text('body').notNull(),
  isPhotographer: integer('is_photographer', { mode: 'boolean' })
    .notNull()
    .default(false),
  status: text('status', { enum: ['visible', 'pending', 'hidden'] })
    .notNull()
    .default('visible'),
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Gallery = typeof galleries.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Visitor = typeof visitors.$inferSelect;
export type Selection = typeof selections.$inferSelect;
export type Comment = typeof comments.$inferSelect;
