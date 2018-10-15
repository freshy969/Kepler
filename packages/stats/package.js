Package.describe({
  version: "1.4.0",
  name: 'keplerjs:stats',
	summary: 'keplerjs plugin statistics data',
	git: "https://github.com/Keplerjs/Kepler.git"
});

Npm.depends({
	'geostats': '1.5.0'
});

Package.onUse(function(api) {

  api.versionsFrom("1.5.1");

  api.use([
    'keplerjs:core'
  ]);

  api.addFiles([
    'plugin.js',
    'i18n/en.js'
  ]);

  api.addFiles([
  	'client/Map_stats.js',
  ],'client');

  api.addFiles([
  	'server/Stats.js',
    'server/Router.js'
  ],'server');

});
