import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  unique,
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
  downloadEnabled: integer('download_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  selectionExportEnabled: integer('selection_export_enabled', {
    mode: 'boolean',
  })
    .notNull()
    .default(true),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
  coverPhotoId: text('cover_photo_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status', { enum: ['processing', 'ready', 'error'] })
      .notNull()
      .default('processing'),
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

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Gallery = typeof galleries.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Visitor = typeof visitors.$inferSelect;
export type Selection = typeof selections.$inferSelect;
