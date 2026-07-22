--[[----------------------------------------------------------------------

JSON.lua
Minimal, self-contained, pure-Lua JSON decoder (with a tiny encoder for
completeness). Written for the Albm Lightroom plugin so the plugin has
zero external dependencies -- the Lightroom SDK does not bundle a JSON
library, and LrHttp only moves raw strings.

Only what AlbmAPI.lua needs is implemented:
  - JSON.decode(str) -> lua value (table/string/number/boolean/nil)
  - JSON.encode(value) -> string  (used nowhere critical today, kept for
    completeness / future use; the plugin only ever sends multipart
    form data, never a JSON body)

This is intentionally small: the Albm API responses handled here are
always flat-ish objects like:
  {"galleries":[{"id":"...","title":"...","slug":"...","type":"..."}]}
  {"id":"...", ...}
  {"duplicate":true,"existingFilename":"..."}
  {"ok":true}
No attempt is made to be a fully spec-compliant JSON library (no
unicode \uXXXX surrogate pairs, no exotic whitespace handling beyond
what's needed) -- just correct enough for these simple, well-formed
API responses.

MIT-style: do whatever you want with this file.

------------------------------------------------------------------------]]

local JSON = {}

-- ===========================================================================
-- Decoding
-- ===========================================================================

local function skipWhitespace(str, pos)
	local _, stop = string.find(str, '^[ \t\r\n]*', pos)
	return stop + 1
end

local decodeValue -- forward declaration

local function decodeError(str, pos, msg)
	error(string.format('JSON.decode error at position %d: %s (near "%s")',
		pos, msg, string.sub(str, pos, pos + 20)))
end

local escapeMap = {
	['"'] = '"',
	['\\'] = '\\',
	['/'] = '/',
	['b'] = '\b',
	['f'] = '\f',
	['n'] = '\n',
	['r'] = '\r',
	['t'] = '\t',
}

local function decodeString(str, pos)
	-- pos points at the opening quote.
	if string.sub(str, pos, pos) ~= '"' then
		decodeError(str, pos, 'expected string')
	end
	local out = {}
	local i = pos + 1
	local len = string.len(str)
	while i <= len do
		local c = string.sub(str, i, i)
		if c == '"' then
			return table.concat(out), i + 1
		elseif c == '\\' then
			local nextC = string.sub(str, i + 1, i + 1)
			if nextC == 'u' then
				-- Basic \uXXXX support: decode as a raw codepoint value
				-- and re-encode naive UTF-8. Sufficient for the ASCII
				-- range Albm's API actually returns (ids, slugs,
				-- filenames); non-BMP / surrogate pairs are not handled.
				local hex = string.sub(str, i + 2, i + 5)
				local code = tonumber(hex, 16) or 0
				if code < 0x80 then
					table.insert(out, string.char(code))
				elseif code < 0x800 then
					table.insert(out, string.char(
						0xC0 + math.floor(code / 0x40),
						0x80 + (code % 0x40)))
				else
					table.insert(out, string.char(
						0xE0 + math.floor(code / 0x1000),
						0x80 + (math.floor(code / 0x40) % 0x40),
						0x80 + (code % 0x40)))
				end
				i = i + 6
			else
				local mapped = escapeMap[nextC]
				if not mapped then
					decodeError(str, i, 'invalid escape sequence')
				end
				table.insert(out, mapped)
				i = i + 2
			end
		else
			table.insert(out, c)
			i = i + 1
		end
	end
	decodeError(str, pos, 'unterminated string')
end

local function decodeNumber(str, pos)
	local numStr = string.match(str, '^-?%d+%.?%d*[eE]?[%+%-]?%d*', pos)
	if not numStr or numStr == '' then
		decodeError(str, pos, 'expected number')
	end
	return tonumber(numStr), pos + string.len(numStr)
end

local function decodeObject(str, pos)
	-- pos points at '{'
	local obj = {}
	local i = skipWhitespace(str, pos + 1)
	if string.sub(str, i, i) == '}' then
		return obj, i + 1
	end
	while true do
		i = skipWhitespace(str, i)
		local key
		key, i = decodeString(str, i)
		i = skipWhitespace(str, i)
		if string.sub(str, i, i) ~= ':' then
			decodeError(str, i, "expected ':'")
		end
		i = skipWhitespace(str, i + 1)
		local value
		value, i = decodeValue(str, i)
		obj[key] = value
		i = skipWhitespace(str, i)
		local c = string.sub(str, i, i)
		if c == ',' then
			i = skipWhitespace(str, i + 1)
		elseif c == '}' then
			return obj, i + 1
		else
			decodeError(str, i, "expected ',' or '}'")
		end
	end
end

local function decodeArray(str, pos)
	-- pos points at '['
	local arr = {}
	local i = skipWhitespace(str, pos + 1)
	if string.sub(str, i, i) == ']' then
		return arr, i + 1
	end
	local n = 0
	while true do
		i = skipWhitespace(str, i)
		local value
		value, i = decodeValue(str, i)
		n = n + 1
		arr[n] = value
		i = skipWhitespace(str, i)
		local c = string.sub(str, i, i)
		if c == ',' then
			i = skipWhitespace(str, i + 1)
		elseif c == ']' then
			return arr, i + 1
		else
			decodeError(str, i, "expected ',' or ']'")
		end
	end
end

decodeValue = function(str, pos)
	pos = skipWhitespace(str, pos)
	local c = string.sub(str, pos, pos)
	if c == '{' then
		return decodeObject(str, pos)
	elseif c == '[' then
		return decodeArray(str, pos)
	elseif c == '"' then
		return decodeString(str, pos)
	elseif c == 't' and string.sub(str, pos, pos + 3) == 'true' then
		return true, pos + 4
	elseif c == 'f' and string.sub(str, pos, pos + 4) == 'false' then
		return false, pos + 5
	elseif c == 'n' and string.sub(str, pos, pos + 3) == 'null' then
		return nil, pos + 4
	elseif c == '-' or string.match(c, '%d') then
		return decodeNumber(str, pos)
	else
		decodeError(str, pos, 'unexpected token')
	end
end

--- Decode a JSON string into a Lua value.
-- Returns nil, errorMessage on failure instead of raising, so callers
-- (AlbmAPI.lua) can handle malformed/unexpected server responses
-- gracefully instead of crashing the publish loop.
function JSON.decode(str)
	if type(str) ~= 'string' or str == '' then
		return nil, 'empty response body'
	end
	local ok, result = pcall(function()
		local value = decodeValue(str, 1)
		return value
	end)
	if not ok then
		return nil, tostring(result)
	end
	return result
end

-- ===========================================================================
-- Encoding (minimal; not currently used for API calls, kept for completeness)
-- ===========================================================================

local encodeValue -- forward declaration

local function encodeString(s)
	local escaped = string.gsub(s, '[%c"\\]', function(c)
		if c == '"' then return '\\"'
		elseif c == '\\' then return '\\\\'
		elseif c == '\n' then return '\\n'
		elseif c == '\r' then return '\\r'
		elseif c == '\t' then return '\\t'
		else return string.format('\\u%04x', string.byte(c))
		end
	end)
	return '"' .. escaped .. '"'
end

local function isArray(t)
	local n = 0
	for _ in pairs(t) do n = n + 1 end
	for i = 1, n do
		if t[i] == nil then return false end
	end
	return n > 0 or next(t) == nil
end

encodeValue = function(v)
	local t = type(v)
	if t == 'string' then
		return encodeString(v)
	elseif t == 'number' then
		return tostring(v)
	elseif t == 'boolean' then
		return tostring(v)
	elseif t == 'nil' then
		return 'null'
	elseif t == 'table' then
		if isArray(v) then
			local parts = {}
			for i, item in ipairs(v) do
				parts[i] = encodeValue(item)
			end
			return '[' .. table.concat(parts, ',') .. ']'
		else
			local parts = {}
			local n = 0
			for k, val in pairs(v) do
				n = n + 1
				parts[n] = encodeString(tostring(k)) .. ':' .. encodeValue(val)
			end
			return '{' .. table.concat(parts, ',') .. '}'
		end
	else
		error('JSON.encode: cannot encode value of type ' .. t)
	end
end

function JSON.encode(value)
	return encodeValue(value)
end

return JSON
