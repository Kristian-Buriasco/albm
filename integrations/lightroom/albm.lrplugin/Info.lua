--[[----------------------------------------------------------------------

Info.lua
Plugin manifest for the Albm Lightroom Classic Publish Service plugin.

This file is read by Lightroom before any other Lua in the plugin is
loaded. It must return a plain table (no logic) describing the plugin
and pointing Lightroom at the Publish Service Provider implementation.

------------------------------------------------------------------------]]

return {

	LrSdkVersion = 6.0,
	LrSdkMinimumVersion = 5.0, -- Publish Service Provider API is stable since 4.0; 5.0 kept as a safe floor.

	LrToolkitIdentifier = 'photo.albm.lightroom.publish',

	LrPluginName = 'Albm',

	LrPluginInfoUrl = 'https://gallery.example.com', -- placeholder; user's self-hosted Albm instance has no single canonical URL

	-- Registers this plugin as a Publish Service provider (as opposed to a
	-- plain export-only service). Lightroom loads
	-- AlbmPublishServiceProvider.lua and looks for the exported table.
	LrExportServiceProvider = {
		title = 'Albm',
		file = 'AlbmPublishServiceProvider.lua',
	},

	VERSION = { major = 1, minor = 0, revision = 0, build = 0 },

}
