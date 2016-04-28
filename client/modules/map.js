/*
	map module, layers,controls e panels

	git@github.com:mWater/offline-leaflet-map.git
	
*/
var layers = {},
	controls = {},
	styles = {
		def: {		//default geojson style
			color: '#b6f', weight: 5, opacity:0.7
		},
		access: {	//tracks
			color: '#66f', weight: 8, opacity: 0.7
		},
		place: {	//circle around place
			color: '#f33', weight: 4, opacity: 0.7, radius: 15,
		},	
		poiline: {	//line from place to pois
			color: '#f33', weight: 4, opacity: 0.7, dashArray: '1,6'
		}
	};

layers.baselayer = new L.TileLayer(' ');

layers.users = new L.LayerGroup();

layers.cluster = new L.MarkerClusterGroup({
	iconCreateFunction: function(cluster) {
		var $icon = L.DomUtil.create('div');
		cluster.checkinsCount = function() {
			var places = _.map(cluster.getAllChildMarkers(), function(marker) {
				return marker.item.id;
			});
			return getCheckinsCountByPlaces(places);
		};
		Blaze.renderWithData(Template.marker_cluster, cluster, $icon);
		return new L.NodeIcon({
			nodeHtml: $icon,
			className: 'marker-cluster'
		});
	},
	maxClusterRadius: 40,
	spiderfyDistanceMultiplier: 1.4,
	showCoverageOnHover: false
});

layers.geojson = new L.GeoJSONAutoClear(null, {
	style: function (feature) {
		return styles[feature.properties.tipo || 'def'] || styles.def;
	},
	pointToLayer: function(feature, latlng) {	//costruisce marker POI
		
		if(feature.properties.tipo==='place')	//evidenzia place nei pois
			return new L.CircleMarker(latlng);
		else
		{
			var iconPoi = L.DomUtil.create('div');
			L.DomUtil.create('i','icon icon-'+feature.properties.tipo, iconPoi);
			return new L.Marker(latlng, {
					icon: new L.NodeIcon({className:'marker-poi', nodeHtml: iconPoi})
				});
		}
	},
	onEachFeature: function (feature, layer) {
		var tmpl, $popup;

		if(feature.geometry.type=='LineString')
			tmpl = Template.popup_track;

		else if(feature.geometry.type=='Point' && feature.properties.name )
			tmpl = Template.popup_poi;

		if(tmpl) {
			$popup = L.DomUtil.create('div');
			Blaze.renderWithData(tmpl, feature.properties, $popup);
			layer.bindPopup($popup, {closeButton:false} );
		}
	}
});

layers.places = new L.LayerJSON({
	layerTarget: layers.cluster,
	minShift: Meteor.settings.public.bboxMinShift,
	caching: false,
	callData: function(bbox, callback) {

		Climbo.map._deps.bbox.changed();

		var sub = Meteor.subscribe('placesByBBox', bbox, function() {
			
			callback( getPlacesByBBox(bbox).fetch() );
		});

		return {
			abort: sub.stop
		};
	},
	dataToMarker: function(data) {	//eseguito una sola volta per ogni place
		//FIXME! sparisce il contenuto dei popup nei markers in cache	
		return Climbo.newPlace(data._id._str).marker;
	}
});
////LAYERS/

controls.zoom = L.control.zoom({
	position: 'bottomright',
	zoomOutText: '',
	zoomInText: ''	
});

controls.attrib = L.control.attribution({
	prefix: i18n('ui.controls.attrib')
});

controls.gps = L.control.gps({
	position: 'topright',
	title: i18n('ui.controls.gps.title'),
	textErr: i18n('ui.controls.gps.error'),
	marker: new L.Marker([0,0], {
		icon: L.divIcon({className: 'marker-gps'})
	}),
	callErr: function(err) {
		Climbo.alert.show(err,'warn');
	}
})
.on({
	gpsdeactivated: function(e) {
		Climbo.profile.setLoc(null);
	},
	gpslocated: function(e) {
		Climbo.profile.setLoc([e.latlng.lat,e.latlng.lng]);
	},
	gpsactivated: function(e) {	//run after gpslocated
		if(Climbo.profile.user && Climbo.profile.user.icon)
			Climbo.profile.user.icon.animate();
		Climbo.alert.show(i18n('ui.alerts.gpson'),'success');		
	}
});

controls.search = L.control.search({
	position: 'topright',
	zoom: Meteor.settings.public.loadLocZoom,	
	autoType: false, tipAutoSubmit: false, delayType: 800,
	minLength: Meteor.settings.public.searchMinLen,	
	autoCollapse: false, autoCollapseTime: 6000,
	animateLocation: true, markerLocation: false,
	propertyLoc: 'loc', propertyName: 'name',
	text: i18n('ui.controls.search.text'),
	textErr: i18n('ui.controls.search.error'),	
	sourceData: function(text, callback) {
		var sub = Meteor.subscribe('placesByName', text, function() {
			var //places = Places.find({name: new RegExp('^'+text,'i') }).fetch(),
				places = getPlacesByName(text).fetch(),
				placesSort = _.sortBy(places,function(item) {
					return item.name + item.reg;
				}),
				placesIds = _.pluck(_.pluck(placesSort, '_id'),'_str');
			
			callback( _.map(placesIds, Climbo.newPlace) );
		});
		return {
			abort: sub.stop
		};
	},
	formatData: function(items) {
		var dataItems = _.map(items, function(item) {
			return _.extend(L.latLng(item.loc), item);
		});
		return _.indexBy(dataItems,'name');
	},
	buildTip: function(key, data) {
		var tip = L.DomUtil.create('div','search-tip');
		Blaze.renderWithData(Template.place_search_tip, data, tip);
		return tip;
	}
})
.on('search_locationfound', function(e) {
	//TODO patch da rimuovere quando L.Control.Search fa la blur da solo
	this._input.blur();
})
.on('search_expanded', function() {
	Router.go('map');
});

Climbo.map = {

	initialized: false,

	leafletMap: null,

	controls: controls,

	layers: layers,

	_deps: {
		bbox: new Tracker.Dependency()
	},

	initMap: function(opts, cb) {		//render map and add controls/layers

		var self = this;

		if(self.initialized) return false;

		self.initialized = true;

		opts = _.defaults({}, opts, {
			zoomControl: false,			
			attributionControl: false
		}, Meteor.settings.public.map);

		self.leafletMap = new L.Map('map', opts);
		
		self.setOpts(opts);

		_.invoke([
			layers.baselayer,		
			//controls.attrib,
			controls.zoom,
			//controls.search,
			controls.gps,
			layers.geojson,
			layers.cluster		
		],'addTo', self.leafletMap);

		//Fix solo per Safari evento resize! quando passa a schermo intero
		$(window).on('orientationchange resize', function(e) {
			$(window).scrollTop(0);
			self.leafletMap.invalidateSize(false);
		});

		if($.isFunction(cb))
			cb.call(self);

		return this;
	},

	setOpts: function(opts) {
		var self = this;

		if(!self.initialized) return null;
		
		opts = _.defaults(opts, Meteor.settings.public.map);

		self.leafletMap.setView(opts.center, opts.zoom);
		console.log('setOpts', opts)
		self.layers.baselayer.setUrl( Meteor.settings.public.layers[opts.layer] );
		return this;
	},

	destroyMap: function() {
		if(this.initialized) {
			this.initialized = false;
			this.leafletMap.remove();
			this.layers.places.clearLayers();
		}
		return this;
	},
	
	getBBox: function() {
		if(!this.initialized) return null;
		
		this._deps.bbox.depend();

		var bbox = this.leafletMap.getBounds(),
			sw = bbox.getSouthWest(),
			ne = bbox.getNorthEast();
/* TODO		sideW = this.$('#sidebar').width();
			sideBox = 
		//L.rectangle(bbox,{fill:false}).addTo(Climbo.map.leafletMap);

			pbox = map.getPixelBounds(),
			h = pbox.getSize().y-,
			w = pbox.getSize().x-;
*/
		return Climbo.util.geo.roundBbox([[sw.lat, sw.lng], [ne.lat, ne.lng]]);
	},
	enableBBox: function() {
		if(!this.initialized) return null;

		if(Meteor.settings.public.showPlaces)
			this.leafletMap.addLayer(layers.places);
		return this;
	},
	disableBBox: function() {
		this.leafletMap.removeLayer(layers.places);
		return this;
	},

	loadLoc: function(loc, cb) {
		if(!this.initialized) return null;

		if(loc && Climbo.util.valid.loc(loc))
			this.leafletMap.setView(loc, Meteor.settings.public.loadLocZoom);

		return this;
	},

	loadItem: function(item, cb) {
		if(!this.initialized) return null;
		
		if(item.type==='place')
			item.marker.addTo(this.layers.places);

		else if(item.type==='user')
			item.marker.addTo(this.layers.users);

		if(_.isFunction(cb))
			this.leafletMap.once("moveend zoomend", cb);
		
		this.loadLoc(item.data.loc);
		
		return this;
	},

	loadGeojson: function(geoData, cb) {

		if(!this.initialized) return null;

		geoData = L.Util.isArray(geoData) ? geoData : [geoData];

		this.leafletMap.closePopup();

		layers.geojson.clearLayers();
		for(var i in geoData) {
			layers.geojson.addData(geoData[i]);
		}
	
		var bb = layers.geojson.getBounds();
		
		if(_.isFunction(cb))
			this.leafletMap.once("moveend zoomend", cb);
		
		this.leafletMap.setView(bb.getCenter(), this.leafletMap.getBoundsZoom(bb) - 1);

		return this;
	}
};
