--[[----------------------------------------------------------------------

AlbmPublishServiceProvider.lua
Publish Service Provider implementation for Albm.

Implements the Lightroom Classic "Publish Service" contract (see the
Lightroom SDK "Export and Publish Service Provider" API reference).
Wires the Publish panel UI (settings dialog, gallery picker, test
connection) to the Albm HTTP API in AlbmAPI.lua, and drives the actual
publish / republish / delete lifecycle in processRenderedPhotos and
deletePhotosFromPublishedCollection.

------------------------------------------------------------------------]]

local LrView = import 'LrView'
local LrTasks = import 'LrTasks'
local LrDialogs = import 'LrDialogs'
local LrLogger = import 'LrLogger'

local AlbmAPI = require 'AlbmAPI'

local logger = LrLogger('AlbmPublish')
logger:enable('logfile') -- writes to the plugin log; helps diagnose issues without a live console

local publishServiceProvider = {}

-- ===========================================================================
-- Basic capability flags
-- ===========================================================================

-- This is a Publish Service (not export-only): supports the
-- add/modify/delete republish lifecycle via published-collection state
-- that Lightroom tracks per photo (publishedPhotoId, edited/unpublished
-- flags, etc).
publishServiceProvider.supportsIncrementalPublish = true

-- Albm has no per-photo resolution requirements to surface in Export
-- dialog; hide that section of the standard export settings.
publishServiceProvider.hidePrintResolution = true

-- Albm publish is photo-only (no video hosting endpoint in the HTTP API).
publishServiceProvider.canExportVideo = false

-- Albm's API has no comment/collection-sync endpoints (yet).
publishServiceProvider.canAddCommentsToService = false

-- Fields persisted as part of the user's Publish Service instance
-- (i.e. saved to the catalog / plugin preset). Everything else placed
-- on the property table (galleryItems, galleryTitleById, etc.) is
-- transient, UI-only state that is recomputed each time the settings
-- dialog opens.
publishServiceProvider.exportPresetFields = {
	{ key = 'baseUrl', default = '' },
	{ key = 'uploadToken', default = '' },
	{ key = 'galleryId', default = '' },
	{ key = 'galleryTitle', default = '' },
}

-- ===========================================================================
-- Collection behavior
-- ===========================================================================

--- A single, simple published collection per Publish Service instance
-- is sufficient for Albm: one Lightroom Publish Service == one Albm
-- gallery (chosen via the popup in sectionsForTopOfDialog). Nested
-- collection sets aren't meaningful against Albm's flat gallery model,
-- so collection sets are disabled (maxCollectionSetDepth = 0).
function publishServiceProvider.getCollectionBehaviorInfo(publishSettings)
	return {
		defaultCollectionName = 'Albm Gallery',
		defaultCollectionCanBeDeleted = true,
		canAddCollection = true,
		maxCollectionSetDepth = 0,
	}
end

-- ===========================================================================
-- Settings dialog (sectionsForTopOfDialog)
-- ===========================================================================

-- Forward-declared so sectionsForTopOfDialog's push_button action (a
-- closure created when the dialog opens) can reference it as an
-- upvalue; the real implementation is assigned further down.
local refreshGalleries

function publishServiceProvider.sectionsForTopOfDialog(f, propertyTable)

	-- Add the galleryId -> galleryTitle observer once per property
	-- table lifetime, so the persisted `galleryTitle` preset field
	-- always tracks whichever gallery id the user has selected (the
	-- popup binds by id; we still want a human-readable title stored,
	-- e.g. for display in the Publish Manager UI or diagnostics).
	if not propertyTable.albmObserverAdded then
		propertyTable:addObserver('galleryId', function()
			local titleById = propertyTable.galleryTitleById or {}
			local title = titleById[propertyTable.galleryId]
			if title then
				propertyTable.galleryTitle = title
			end
		end)
		propertyTable.albmObserverAdded = true
	end

	-- If this Publish Service was already configured previously (e.g.
	-- reopening Publish Manager on an existing service), proactively
	-- refresh the gallery list in the background so the popup isn't
	-- empty. Non-interactive: don't pop an alert on failure here, the
	-- user can hit "Test Connection" if the popup stays empty.
	if (propertyTable.galleryItems == nil or #propertyTable.galleryItems == 0)
		and propertyTable.baseUrl ~= nil and propertyTable.baseUrl ~= ''
		and propertyTable.uploadToken ~= nil and propertyTable.uploadToken ~= '' then
		refreshGalleries(propertyTable, false)
	end

	return {
		{
			title = 'Albm Server',
			synopsis = propertyTable.galleryTitle ~= '' and propertyTable.galleryTitle or propertyTable.baseUrl,

			f:row {
				spacing = f:control_spacing(),
				f:static_text {
					title = 'Base URL:',
					alignment = 'right',
					width = LrView.share 'albm_label_width',
				},
				f:edit_field {
					value = LrView.bind 'baseUrl',
					fill_horizontal = 1,
					immediate = true,
					placeholder_string = 'https://gallery.example.com',
				},
			},

			f:row {
				spacing = f:control_spacing(),
				f:static_text {
					title = 'Upload token:',
					alignment = 'right',
					width = LrView.share 'albm_label_width',
				},
				f:password_field {
					value = LrView.bind 'uploadToken',
					fill_horizontal = 1,
					immediate = true,
					placeholder_string = 'Created in Albm -> Settings -> Sharing',
				},
			},

			f:row {
				spacing = f:control_spacing(),
				f:static_text {
					title = '',
					width = LrView.share 'albm_label_width',
				},
				f:push_button {
					title = 'Test Connection && Load Galleries',
					action = function()
						refreshGalleries(propertyTable, true)
					end,
				},
			},

			f:row {
				spacing = f:control_spacing(),
				f:static_text {
					title = 'Gallery:',
					alignment = 'right',
					width = LrView.share 'albm_label_width',
				},
				f:popup_menu {
					value = LrView.bind 'galleryId',
					items = LrView.bind 'galleryItems',
					fill_horizontal = 1,
					enabled = LrView.bind {
						key = 'galleryItems',
						transform = function(value)
							return value ~= nil and #value > 0
						end,
					},
				},
			},
		},
	}
end

--- Calls AlbmAPI.listGalleries in a background task and populates
-- propertyTable.galleryItems (bound to the popup_menu) plus
-- propertyTable.galleryTitleById (used by the galleryId observer
-- above to keep galleryTitle in sync). When `interactive` is true,
-- shows a success/failure LrDialogs.message -- used for the explicit
-- "Test Connection" button; the passive pre-population on dialog open
-- passes interactive = false to stay quiet on failure.
refreshGalleries = function(propertyTable, interactive)
	LrTasks.startAsyncTask(function()
		local galleries, errMsg = AlbmAPI.listGalleries(propertyTable.baseUrl, propertyTable.uploadToken)

		if errMsg then
			propertyTable.galleryItems = {}
			logger:error('Albm: listGalleries failed: ' .. tostring(errMsg))
			if interactive then
				LrDialogs.message('Albm connection failed', errMsg, 'error')
			end
			return
		end

		local items = {}
		local titleById = {}
		for _, gallery in ipairs(galleries) do
			table.insert(items, {
				title = gallery.title .. ' (' .. tostring(gallery.type) .. ')',
				value = gallery.id,
			})
			titleById[gallery.id] = gallery.title
		end

		propertyTable.galleryTitleById = titleById
		propertyTable.galleryItems = items

		-- If nothing is selected yet but we got results, default to
		-- the first gallery so the popup isn't left blank.
		if (propertyTable.galleryId == nil or propertyTable.galleryId == '') and items[1] then
			propertyTable.galleryId = items[1].value
			propertyTable.galleryTitle = galleries[1].title
		end

		if interactive then
			local count = #galleries
			LrDialogs.message(
				'Albm connection succeeded',
				string.format('Found %d galler%s.', count, count == 1 and 'y' or 'ies'),
				'info')
		end
	end, 'Albm: Fetching galleries')
end

-- ===========================================================================
-- Export settings
-- ===========================================================================

--- Albm's upload endpoints accept JPEG (and PNG, but Lightroom export
-- renditions here are always JPEG); force the export format so users
-- can't accidentally pick TIFF/PSD/DNG from the standard file settings
-- section that Lightroom still shows beneath our custom section.
function publishServiceProvider.updateExportSettings(exportSettings)
	exportSettings.LR_format = 'JPEG'
end

-- ===========================================================================
-- Publish: add / modify
-- ===========================================================================

--- Core publish loop. Called by Lightroom once per publish operation
-- with every rendition (new + modified + already-published-unchanged
-- is NOT included here -- Lightroom only queues renditions that are
-- new or marked "modified" since last publish).
function publishServiceProvider.processRenderedPhotos(functionContext, exportContext)

	local exportSession = exportContext.exportSession
	local publishSettings = exportContext.propertyTable

	local baseUrl = publishSettings.baseUrl
	local uploadToken = publishSettings.uploadToken
	local galleryId = publishSettings.galleryId

	local nPhotos = exportSession:countRenditions()

	local progressScope = exportContext:configureProgress {
		title = nPhotos > 1
			and string.format('Publishing %d photos to Albm', nPhotos)
			or 'Publishing photo to Albm',
	}

	local failureMessages = {}
	local completed = 0

	for _, rendition in exportContext:renditions { stopIfCanceled = true } do

		if progressScope:isCanceled() then
			break
		end

		local renderSuccess, pathOrMessage = rendition:waitForRender()

		if renderSuccess then
			local filePath = pathOrMessage

			-- Lightroom supplies the previously-recorded remote id for
			-- renditions of already-published photos; nil for photos
			-- being published for the first time.
			local existingRemoteId = rendition.publishedPhotoId

			local newRemoteId, errMsg

			if existingRemoteId ~= nil and existingRemoteId ~= '' then
				-- Already published: this rendition was queued because
				-- the photo (or its develop settings) changed since
				-- last publish -- replace the remote content.
				newRemoteId, errMsg = AlbmAPI.replacePhoto(baseUrl, uploadToken, galleryId, existingRemoteId, filePath)

				if errMsg == 'not_found' then
					-- Remote photo was deleted out-of-band (e.g. someone
					-- removed it in the Albm admin UI). Fall back to a
					-- fresh upload so the photo still ends up published.
					logger:info('Albm: photo id ' .. tostring(existingRemoteId) .. ' missing remotely; re-uploading.')
					newRemoteId, errMsg = AlbmAPI.uploadPhoto(baseUrl, uploadToken, galleryId, filePath)
				end
			else
				-- First-time publish of this photo.
				newRemoteId, errMsg = AlbmAPI.uploadPhoto(baseUrl, uploadToken, galleryId, filePath)
			end

			if errMsg then
				table.insert(failureMessages, filePath .. ': ' .. errMsg)
				rendition:uploadFailed(errMsg)
			else
				if newRemoteId then
					-- Normal success path: server returned a (new) id.
					-- On first publish this is the initial id; on
					-- replace, Albm always mints a *new* id, which is
					-- exactly what we're recording here.
					rendition:recordPublishedPhotoId(newRemoteId)
				elseif existingRemoteId ~= nil and existingRemoteId ~= '' then
					-- errMsg nil and newRemoteId nil means the server
					-- reported {"duplicate":true}: content unchanged,
					-- no new id issued. Keep the existing remote id.
					rendition:recordPublishedPhotoId(existingRemoteId)
				end
				-- (A duplicate response on a brand-new, never-published
				-- photo is not expected by the API contract; if it ever
				-- happens there's no id to record and nothing more we
				-- can safely do, so it's left unrecorded rather than
				-- guessed at.)
			end
		else
			-- The export render itself failed (pathOrMessage is Lightroom's
			-- error message); nothing to upload for this photo.
			table.insert(failureMessages, tostring(pathOrMessage))
		end

		completed = completed + 1
		progressScope:setPortionComplete(completed, nPhotos)
	end

	progressScope:done()

	if #failureMessages > 0 then
		logger:error('Albm: publish completed with ' .. #failureMessages .. ' failure(s):\n' .. table.concat(failureMessages, '\n'))
		LrDialogs.message(
			'Albm publish finished with errors',
			string.format('%d photo(s) failed to publish:\n\n%s', #failureMessages, table.concat(failureMessages, '\n')),
			'warning')
	end
end

-- ===========================================================================
-- Publish: delete
-- ===========================================================================

--- Called by Lightroom when photos are removed from a published
-- collection (or the collection itself is deleted). Must delete the
-- corresponding remote content and call deletedCallback(photoId) for
-- each one that is confirmed gone, so Lightroom can drop its local
-- bookkeeping for it. Ids not passed to deletedCallback are retried on
-- a later publish/delete pass.
function publishServiceProvider.deletePhotosFromPublishedCollection(publishSettings, arrayOfPhotoIds, deletedCallback)

	local baseUrl = publishSettings.baseUrl
	local uploadToken = publishSettings.uploadToken
	local galleryId = publishSettings.galleryId

	for _, photoId in ipairs(arrayOfPhotoIds) do
		local ok, errMsg = AlbmAPI.deletePhoto(baseUrl, uploadToken, galleryId, photoId)
		if ok then
			deletedCallback(photoId)
		else
			logger:error('Albm: failed to delete photo ' .. tostring(photoId) .. ': ' .. tostring(errMsg))
			-- Do not call deletedCallback; Lightroom will re-offer this
			-- id for deletion on a subsequent sync.
		end
	end
end

return publishServiceProvider
