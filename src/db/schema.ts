import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  unique,
  blob,
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
  featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
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
  previewPhotoId: text('preview_photo_id'),
  coverFocusX: integer('cover_focus_x').notNull().default(50),
  coverFocusY: integer('cover_focus_y').notNull().default(50),
  pinEnabled: integer('pin_enabled', { mode: 'boolean' }).notNull().default(false),
  pinHash: text('pin_hash'),
  folderId: text('folder_id').references(() => galleryFolders.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  autoPublishOnUpload: integer('auto_publish_on_upload', { mode: 'boolean' })
    .notNull()
    .default(false),
  deliverRaw: integer('deliver_raw', { mode: 'boolean' }).notNull().default(false),
  forensicWatermark: integer('forensic_watermark', { mode: 'boolean' })
    .notNull()
    .default(false),
  downloadOfferWeb: integer('download_offer_web', { mode: 'boolean' })
    .notNull()
    .default(false),
  downloadOfferPrint: integer('download_offer_print', { mode: 'boolean' })
    .notNull()
    .default(false),
  downloadOfferOriginal: integer('download_offer_original', { mode: 'boolean' })
    .notNull()
    .default(true),
  keepExifOnDownload: integer('keep_exif_on_download', { mode: 'boolean' })
    .notNull()
    .default(true),
  allowGpsInDownload: integer('allow_gps_in_download', { mode: 'boolean' })
    .notNull()
    .default(false),
  /** [option] OCR bib-number detection at upload. Default off. */
  bibSearch: integer('bib_search', { mode: 'boolean' }).notNull().default(false),
  /** [option] Face embedding batch + selfie search. Default off. */
  faceSearch: integer('face_search', { mode: 'boolean' }).notNull().default(false),
  /** [option] Public event landing page + venue QR. Default off. */
  eventPage: integer('event_page', { mode: 'boolean' }).notNull().default(false),
  faceBatchStatus: text('face_batch_status', {
    enum: ['idle', 'running', 'done', 'error'],
  })
    .notNull()
    .default('idle'),
  faceBatchDone: integer('face_batch_done').notNull().default(0),
  faceBatchTotal: integer('face_batch_total').notNull().default(0),
  faceBatchError: text('face_batch_error'),
  faceBatchUpdatedAt: integer('face_batch_updated_at'),
  deliveryState: text('delivery_state', {
    enum: ['proofing', 'retouching', 'delivered'],
  })
    .notNull()
    .default('proofing'),
  ...timestamps,
});

export const galleryFolders = sqliteTable('gallery_folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
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
    placeholder: text('placeholder'),
    altText: text('alt_text'),
    contentHash: text('content_hash'),
    isRaw: integer('is_raw', { mode: 'boolean' }).notNull().default(false),
    format: text('format'),
    /** Principal who uploaded: null = owner, else a collaborators.id. */
    uploadedBy: text('uploaded_by'),
    ...timestamps,
  },
  (t) => [unique().on(t.galleryId, t.filename)],
);

export const visitors = sqliteTable('visitors', {
  id: text('id').primaryKey(),
  galleryId: text('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  accountId: text('account_id').references(() => clientAccounts.id, { onDelete: 'set null' }),
  name: text('name'),
  email: text('email'),
  sessionToken: text('session_token').notNull().unique(),
  ...timestamps,
});

export const selectionLists = sqliteTable(
  'selection_lists',
  {
    id: text('id').primaryKey(),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [index('selection_lists_gallery_visitor_idx').on(t.galleryId, t.visitorId)],
);

export const selections = sqliteTable(
  'selections',
  {
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id')
      .notNull()
      .references(() => visitors.id, { onDelete: 'cascade' }),
    listId: text('list_id').references(() => selectionLists.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [
    unique('selections_photo_visitor_list_idx').on(
      t.photoId,
      t.visitorId,
      t.listId,
    ),
  ],
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
    photoId: text('photo_id').references(() => photos.id, { onDelete: 'set null' }),
    visitorId: text('visitor_id'),
    kind: text('kind').notNull(),
    country: text('country'),
    city: text('city'),
    referrer: text('referrer'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [index('view_events_gallery_created_idx').on(t.galleryId, t.createdAt)],
);

/** Admin-only delivery-lifecycle history for a gallery (state changes + notes). */
export const galleryEvents = sqliteTable(
  'gallery_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['state_change', 'note'] }).notNull(),
    fromState: text('from_state'),
    toState: text('to_state'),
    note: text('note'),
    actorType: text('actor_type').notNull().default('owner'),
    actorId: text('actor_id'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [index('gallery_events_gallery_created_idx').on(t.galleryId, t.createdAt)],
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

export const downloadMarks = sqliteTable(
  'download_marks',
  {
    id: text('id').primaryKey(),
    markKey: text('mark_key').notNull(),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id'),
    accountId: text('account_id'),
    at: integer('at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [
    unique().on(t.markKey),
    index('download_marks_photo_idx').on(t.photoId),
    index('download_marks_at_idx').on(t.at),
  ],
);

/** Detected bib / race numbers from OCR (3A). */
export const photoBibs = sqliteTable(
  'photo_bibs',
  {
    id: text('id').primaryKey(),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [
    index('photo_bibs_gallery_number_idx').on(t.galleryId, t.number),
    index('photo_bibs_photo_idx').on(t.photoId),
    unique('photo_bibs_photo_number_idx').on(t.photoId, t.number),
  ],
);

/** Face embeddings from overnight batch (3B). Biometric — purge on gallery delete. */
export const photoFaces = sqliteTable(
  'photo_faces',
  {
    id: text('id').primaryKey(),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    faceIdx: integer('face_idx').notNull(),
    embedding: blob('embedding', { mode: 'buffer' }).notNull(),
    bboxX: integer('bbox_x').notNull(),
    bboxY: integer('bbox_y').notNull(),
    bboxW: integer('bbox_w').notNull(),
    bboxH: integer('bbox_h').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [
    index('photo_faces_gallery_idx').on(t.galleryId),
    index('photo_faces_photo_idx').on(t.photoId),
    unique('photo_faces_photo_face_idx').on(t.photoId, t.faceIdx),
  ],
);

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

export const adminCredentials = sqliteTable(
  'admin_credentials',
  {
    id: text('id').primaryKey(),
    credentialId: text('credential_id').notNull(),
    publicKey: blob('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports'),
    label: text('label').notNull(),
    /** null = owner credential; else the collaborators.id it authenticates. */
    collaboratorId: text('collaborator_id'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
    lastUsedAt: integer('last_used_at'),
  },
  (t) => [unique().on(t.credentialId)],
);

export const recoveryCodes = sqliteTable('recovery_codes', {
  id: text('id').primaryKey(),
  codeHash: text('code_hash').notNull(),
  usedAt: integer('used_at'),
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const photoTags = sqliteTable(
  'photo_tags',
  {
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.photoId, t.tagId] })],
);

export const galleryTags = sqliteTable(
  'gallery_tags',
  {
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.galleryId, t.tagId] })],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    at: integer('at').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    summary: text('summary').notNull(),
    /** Who acted: 'owner' (default, incl. legacy rows) or 'collaborator'. */
    actorType: text('actor_type').notNull().default('owner'),
    /** collaborators.id when actorType='collaborator'; null for owner. */
    actorId: text('actor_id'),
  },
  (t) => [
    index('audit_log_at_idx').on(t.at),
    index('audit_log_action_idx').on(t.action),
  ],
);

export const uploadTokens = sqliteTable('upload_tokens', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
  lastUsedAt: integer('last_used_at'),
  revokedAt: integer('revoked_at'),
});

export const clientAccounts = sqliteTable(
  'client_accounts',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
    lastLoginAt: integer('last_login_at'),
  },
  (t) => [unique().on(t.email)],
);

export const magicLinks = sqliteTable('magic_links', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => clientAccounts.id, { onDelete: 'cascade' }),
  galleryId: text('gallery_id')
    .notNull()
    .references(() => galleries.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
});

export const rateLimitHits = sqliteTable(
  'rate_limit_hits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull(),
    at: integer('at').notNull(),
  },
  (t) => [index('rate_limit_hits_key_at_idx').on(t.key, t.at)],
);

export const adminSessions = sqliteTable(
  'admin_sessions',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
    lastSeenAt: integer('last_seen_at')
      .notNull()
      .$defaultFn(() => Date.now()),
    userAgentHash: text('user_agent_hash'),
    ipHash: text('ip_hash'),
    /** Coarse device label (e.g. "Chrome on macOS"), not a fingerprint. */
    device: text('device'),
    /** Coarse geo (e.g. "Turin, IT"); null when no geo DB is present. */
    location: text('location'),
    /** null = owner session; else the collaborators.id acting. */
    collaboratorId: text('collaborator_id'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('admin_sessions_revoked_idx').on(t.revokedAt)],
);

/** A person granted scoped access to specific galleries (not the owner). */
export const collaborators = sqliteTable('collaborators', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
  lastLoginAt: integer('last_login_at'),
  /** When set, the collaborator is hard-disabled and cannot authenticate. */
  disabledAt: integer('disabled_at'),
});

/**
 * A grant on one gallery. kind='collaborator' → collaboratorId set (account);
 * kind='contributor' → tokenHash set (account-less link, Contributor tier —
 * schema present now, feature built later). capabilities is a JSON string array.
 */
export const galleryGrants = sqliteTable(
  'gallery_grants',
  {
    id: text('id').primaryKey(),
    galleryId: text('gallery_id')
      .notNull()
      .references(() => galleries.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['collaborator', 'contributor'] }).notNull(),
    collaboratorId: text('collaborator_id').references(() => collaborators.id, {
      onDelete: 'cascade',
    }),
    tokenHash: text('token_hash'),
    capabilities: text('capabilities').notNull().default('["upload","organize"]'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
    createdBy: text('created_by'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [
    index('gallery_grants_gallery_idx').on(t.galleryId),
    index('gallery_grants_collaborator_idx').on(t.collaboratorId),
  ],
);

/** Single-use invite tokens for onboarding a collaborator (hashed). */
export const collaboratorInvites = sqliteTable('collaborator_invites', {
  id: text('id').primaryKey(),
  collaboratorId: text('collaborator_id')
    .notNull()
    .references(() => collaborators.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
  createdAt: integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now()),
});

export type Collaborator = typeof collaborators.$inferSelect;
export type GalleryGrant = typeof galleryGrants.$inferSelect;

export type GalleryFolder = typeof galleryFolders.$inferSelect;

export type Gallery = typeof galleries.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Visitor = typeof visitors.$inferSelect;
export type Selection = typeof selections.$inferSelect;
export type SelectionList = typeof selectionLists.$inferSelect;
export type ClientAccount = typeof clientAccounts.$inferSelect;
export type UploadToken = typeof uploadTokens.$inferSelect;
export type Comment = typeof comments.$inferSelect;
