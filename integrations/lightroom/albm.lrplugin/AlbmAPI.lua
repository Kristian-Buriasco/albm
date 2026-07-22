--[[----------------------------------------------------------------------

AlbmAPI.lua
Thin HTTP client for the Albm publish HTTP API. All network I/O for the
plugin funnels through this module so the Publish Service Provider code
can stay focused on the Lightroom SDK contract.

SDK note on HTTP verbs (documented-standard choice, see task brief):
LrHttp.postMultipart() in the published Lightroom SDK reference only
ever issues a POST -- there is no documented way to pass a method
override into it for PUT. Rather than depend on undocumented behavior,
this module builds the `multipart/form-data` request body itself (a
small, well-understood format) and sends every request -- GET aside --
through LrHttp.post(url, body, headers, method, timeoutSecs), which
*does* take an explicit method argument in the SDK. That gives us a
single, consistent code path for POST (upload), PUT (replace) and
DELETE, all capable of carrying a multipart body when needed.

------------------------------------------------------------------------]]

local LrHttp = import 'LrHttp'
local LrPathUtils = import 'LrPathUtils'

local JSON = require 'JSON'

local AlbmAPI = {}

-- ===========================================================================
-- Multipart body construction
-- ===========================================================================

local BOUNDARY = '----AlbmLightroomBoundary7f3a9c2e1d'

--- Read a whole local file into a Lua string, in binary mode.
local function readFileBinary(filePath)
	local f, openErr = io.open(filePath, 'rb')
	if not f then
		error('Albm: could not open file for upload: ' .. tostring(filePath) .. ' (' .. tostring(openErr) .. ')')
	end
	local data = f:read('*a')
	f:close()
	return data
end

--- Build a multipart/form-data body.
-- @param fields table of simple field name -> string value pairs (may be nil/empty)
-- @param filePath path to the file to attach as the "file" field
-- @param fileFieldName the multipart field name to use for the file (always "file" for Albm)
-- @return body (string), contentType (string, includes boundary)
local function buildMultipartBody(fields, filePath, fileFieldName)
	local parts = {}

	if fields then
		for name, value in pairs(fields) do
			if value ~= nil and value ~= '' then
				table.insert(parts,
					'--' .. BOUNDARY .. '\r\n' ..
					'Content-Disposition: form-data; name="' .. name .. '"\r\n\r\n' ..
					tostring(value) .. '\r\n')
			end
		end
	end

	if filePath then
		local fileName = LrPathUtils.leafName(filePath)
		local fileData = readFileBinary(filePath)
		table.insert(parts,
			'--' .. BOUNDARY .. '\r\n' ..
			'Content-Disposition: form-data; name="' .. fileFieldName .. '"; filename="' .. fileName .. '"\r\n' ..
			'Content-Type: image/jpeg\r\n\r\n' ..
			fileData .. '\r\n')
	end

	table.insert(parts, '--' .. BOUNDARY .. '--\r\n')

	local body = table.concat(parts)
	local contentType = 'multipart/form-data; boundary=' .. BOUNDARY
	return body, contentType
end

-- ===========================================================================
-- Low-level request helper
-- ===========================================================================

--- Strip a trailing slash from a configured base URL so we don't end up
-- with accidental "//" when concatenating paths.
local function normalizeBaseUrl(baseUrl)
	if not baseUrl then return '' end
	return string.gsub(baseUrl, '/+$', '')
end

--- Perform an HTTP request against the Albm API and decode the JSON
-- response.
-- @param method 'GET' | 'POST' | 'PUT' | 'DELETE'
-- @param baseUrl configured Albm base URL, e.g. https://gallery.example.com
-- @param path request path beginning with '/', e.g. '/api/publish/galleries'
-- @param uploadToken the bearer token from plugin settings
-- @param body optional raw request body (string)
-- @param contentType optional Content-Type header value for `body`
-- @return decoded (table|nil), statusCode (number|nil), rawBody (string|nil), errMsg (string|nil)
local function request(method, baseUrl, path, uploadToken, body, contentType)
	local url = normalizeBaseUrl(baseUrl) .. path

	local headers = {
		{ field = 'Authorization', value = 'Bearer ' .. tostring(uploadToken or '') },
	}
	if contentType then
		table.insert(headers, { field = 'Content-Type', value = contentType })
	end

	local result, respHeaders

	if method == 'GET' then
		result, respHeaders = LrHttp.get(url, headers, 60)
	else
		-- LrHttp.post's 4th argument overrides the HTTP method, so this
		-- single call path handles POST, PUT and DELETE alike.
		result, respHeaders = LrHttp.post(url, body or '', headers, method, 60)
	end

	if not respHeaders then
		return nil, nil, nil, 'Albm: no response from server (network error / timeout)'
	end

	-- LrHttp surfaces low-level connection errors via respHeaders.error.
	if respHeaders.error then
		local errMsg = respHeaders.error.name or 'unknown network error'
		return nil, nil, nil, 'Albm: request failed: ' .. tostring(errMsg)
	end

	local status = respHeaders.status

	local decoded
	if result and result ~= '' then
		local decodeErr
		decoded, decodeErr = JSON.decode(result)
		if not decoded and decodeErr then
			-- Non-JSON body (e.g. an HTML error page from a proxy). Not
			-- fatal on its own -- callers decide what to do based on
			-- status code -- but surface it for logging.
			return nil, status, result, 'Albm: response was not valid JSON: ' .. tostring(decodeErr)
		end
	end

	return decoded, status, result, nil
end

-- ===========================================================================
-- Public API
-- ===========================================================================

--- GET /api/publish/galleries
-- @return galleries (array of {id,title,slug,type}) on success, nil+errMsg on failure
function AlbmAPI.listGalleries(baseUrl, uploadToken)
	local decoded, status, _, errMsg = request('GET', baseUrl, '/api/publish/galleries', uploadToken)

	if errMsg then
		return nil, errMsg
	end

	if status == 401 then
		return nil, 'Invalid or missing upload token (401 Unauthorized).'
	end

	if status ~= 200 or not decoded then
		return nil, 'Unexpected response from server (status ' .. tostring(status) .. ').'
	end

	return decoded.galleries or {}, nil
end

--- POST /api/publish/{galleryId}/photos
-- Uploads a new photo. On success returns the new photo id (a string).
-- @param sectionId optional section id to place the photo into
-- @return photoId (string|nil), errMsg (string|nil), statusCode (number|nil)
function AlbmAPI.uploadPhoto(baseUrl, uploadToken, galleryId, filePath, sectionId)
	local fields = nil
	if sectionId and sectionId ~= '' then
		fields = { sectionId = sectionId }
	end

	local body, contentType = buildMultipartBody(fields, filePath, 'file')

	local path = '/api/publish/' .. galleryId .. '/photos'
	local decoded, status, _, errMsg = request('POST', baseUrl, path, uploadToken, body, contentType)

	if errMsg then
		return nil, errMsg, status
	end

	if status == 201 or status == 200 then
		if decoded and decoded.duplicate then
			-- Identical content already exists server-side; treat as a
			-- successful publish. There is no *new* remote id supplied
			-- in this case, so the caller must keep whatever id (or
			-- lack of one) it already had. Signal this distinctly.
			return nil, nil, status
		end
		if decoded and decoded.id then
			return decoded.id, nil, status
		end
		return nil, 'Albm: upload succeeded but response had no photo id.', status
	end

	local statusMessages = {
		[401] = 'Invalid or missing upload token (401 Unauthorized).',
		[404] = 'Gallery not found (404).',
		[413] = 'File too large: exceeds the 50 MB limit (413).',
		[415] = 'Unsupported file type: Albm only accepts JPEG/PNG (415).',
		[429] = 'Rate limited by server (429). Try again later.',
	}
	return nil, statusMessages[status] or ('Upload failed (status ' .. tostring(status) .. ').'), status
end

--- PUT /api/publish/{galleryId}/photos/{photoId}
-- Replaces an already-published photo's content. IMPORTANT: Albm issues
-- a brand-new photo id on replace -- the caller must overwrite its
-- stored remote id with the returned one.
-- @return newPhotoId (string|nil), errMsg (string|nil), statusCode (number|nil)
function AlbmAPI.replacePhoto(baseUrl, uploadToken, galleryId, photoId, filePath)
	local body, contentType = buildMultipartBody(nil, filePath, 'file')

	local path = '/api/publish/' .. galleryId .. '/photos/' .. photoId
	local decoded, status, _, errMsg = request('PUT', baseUrl, path, uploadToken, body, contentType)

	if errMsg then
		return nil, errMsg, status
	end

	if status == 200 then
		if decoded and decoded.duplicate then
			-- Content-identical replace: treat as success, but there is
			-- no new id to record. Caller keeps the existing id.
			return nil, nil, status
		end
		if decoded and decoded.id then
			return decoded.id, nil, status
		end
		return nil, 'Albm: replace succeeded but response had no photo id.', status
	end

	if status == 404 then
		-- The photo no longer exists remotely. Caller should fall back
		-- to a fresh upload (AlbmAPI.uploadPhoto) so the image still
		-- gets published.
		return nil, 'not_found', status
	end

	local statusMessages = {
		[401] = 'Invalid or missing upload token (401 Unauthorized).',
		[413] = 'File too large: exceeds the 50 MB limit (413).',
		[415] = 'Unsupported file type: Albm only accepts JPEG/PNG (415).',
		[429] = 'Rate limited by server (429). Try again later.',
	}
	return nil, statusMessages[status] or ('Replace failed (status ' .. tostring(status) .. ').'), status
end

--- DELETE /api/publish/{galleryId}/photos/{photoId}
-- @return ok (boolean), errMsg (string|nil)
function AlbmAPI.deletePhoto(baseUrl, uploadToken, galleryId, photoId)
	local path = '/api/publish/' .. galleryId .. '/photos/' .. photoId
	local decoded, status, _, errMsg = request('DELETE', baseUrl, path, uploadToken)

	if errMsg then
		return false, errMsg
	end

	if status == 200 then
		return true, nil
	end

	if status == 404 then
		-- Already gone server-side; the goal state (not present) is
		-- already achieved, so treat this as success too.
		return true, nil
	end

	local statusMessages = {
		[401] = 'Invalid or missing upload token (401 Unauthorized).',
	}
	return false, statusMessages[status] or ('Delete failed (status ' .. tostring(status) .. ').')
end

return AlbmAPI
