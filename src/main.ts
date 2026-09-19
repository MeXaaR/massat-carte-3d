import { dataUrl, productionData } from './data';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { createElement, Search, X, Grid2X2, MapPin, Route, Plus, Minus, Navigation2, Maximize, Info, Crosshair, Check, Images, Trees, type IconNode } from 'lucide';
import { SearchClient } from './search-client';
import { kindNames, type SearchItem, type SearchKind } from './search';
import { createOverlays } from './overlays';
import './style.css';

maplibregl.setWorkerUrl(workerUrl);
maplibregl.setWorkerCount(2);

const icon = (node: IconNode, cls = '') => createElement(node, { 'aria-hidden': 'true', class: cls }).outerHTML;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const areaLabel = (value: number | undefined | null) => value == null ? 'Non renseignée' : `${numberFormat.format(value)} m²`;
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = reducedMotion ? 0 : 1050;

el('app').innerHTML = `
  <div id="map" role="region" aria-label="Carte 3D de Massat et des communes voisines"></div>
  <div class="left-tools">
    <section class="search-card" aria-label="Rechercher dans la région">
      <div class="search-line">${icon(Search)}
        <label class="sr-only" for="search">Rechercher une parcelle, un hameau ou une rue</label>
        <input id="search" type="search" placeholder="Parcelle, hameau, rue…" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="result-list" disabled>
        <button id="clear-search" class="icon-button" aria-label="Effacer la recherche" hidden>${icon(X)}</button>
      </div>
      <div id="search-results" class="search-results" hidden>
        <div class="filters" aria-label="Type de recherche">
          <button class="filter" data-kind="all" aria-pressed="true">Tout</button>
          <button class="filter" data-kind="parcel" aria-pressed="false">Parcelles</button>
          <button class="filter" data-kind="hamlet" aria-pressed="false">Hameaux</button>
          <button class="filter" data-kind="road" aria-pressed="false">Voies</button>
        </div>
        <p id="results-caption" class="results-caption" aria-live="polite"></p>
        <ul id="result-list" class="result-list" role="listbox" aria-label="Résultats de la recherche"></ul>
      </div>
    </section>
    <div class="layer-row" aria-label="Couches de la carte">
      <button id="parcels" class="pill" aria-pressed="false" disabled>${icon(Grid2X2)}Parcelles${icon(Check, 'tick')}</button>
      <button id="satellite" class="pill" aria-pressed="false" disabled>${icon(Images)}Satellite${icon(Check, 'tick')}</button>
      <button id="details" class="pill" aria-pressed="true" title="Arbres et bâtiments détaillés à proximité" disabled>${icon(Trees)}Détails</button>
    </div>
    <label class="commune-picker"><span class="sr-only">Aller à une commune</span><select id="commune-picker" aria-label="Aller à une commune"><option value="">Toute la région</option></select></label>
    <div class="layer-row overlay-row">
      <button id="urbanism" class="pill" aria-pressed="false" disabled>Urbanisme</button>
      <button id="centres" class="pill" aria-pressed="false" disabled>Centres proposés</button>
    </div>
    <section id="urbanism-panel" class="overlay-panel" aria-label="Zonage d’urbanisme" hidden>
      <div class="overlay-heading"><strong>Zonage DDT 09</strong><button id="urbanism-refresh">Actualiser</button></div>
      <p id="urbanism-status" role="status"></p><p id="urbanism-coverage"></p>
      <details><summary>Légende et source</summary><div class="zone-legend"><span style="--zone:#ce608c">U</span><span style="--zone:#ed9d39">AU</span><span style="--zone:#d1bd3e">A</span><span style="--zone:#438b72">N</span><span style="--zone:#8480c5">Carte communale</span><span style="--zone:#758896">Autre</span></div>
      <p>Couleurs par famille de codes. Cliquez sur une zone pour son code exact, sa date et son règlement. Les données suivent les publications de la DDT.</p>
      <a href="https://carto2.geo-ide.din.developpement-durable.gouv.fr/frontoffice/?map=d8de8132-4e9f-4a0a-b3d5-cf9d980c321c" target="_blank" rel="noopener noreferrer">Consulter la carte officielle ↗</a></details>
    </section>
    <section id="centres-panel" class="overlay-panel" aria-label="Périmètres proposés des bourgs" hidden>
      <details open><summary>Centres proposés pour le rendu 3D</summary><p>Enveloppes bâties IGN ; à Boussenac, noyau d’Espiés autour de la mairie. Ces périmètres servent au rendu des bâtiments et ne constituent pas un zonage réglementaire.</p><div id="centres-list"></div></details>
    </section>
    <section id="selection" class="selection-card" aria-label="Lieu sélectionné" hidden></section>
  </div>
  <div class="place-title"><h1>Massat</h1><p id="region-summary">Commune de Massat, en relief</p></div>
  <nav class="navigation" aria-label="Navigation dans la carte">
    <div class="nav-group"><button id="home" class="nav-button" aria-label="Voir toute la région" title="Toute la région">${icon(Maximize)}</button></div>
    <div class="nav-group"><button id="compass" class="nav-button" aria-label="Remettre le nord en haut" title="Nord en haut">${icon(Navigation2)}</button><button id="view-mode" class="nav-button" aria-label="Passer en vue de dessus" title="Vue de dessus" aria-pressed="true">2D</button></div>
    <div class="nav-group"><button id="zoom-in" class="nav-button" aria-label="Zoomer" title="Zoomer">${icon(Plus)}</button><button id="zoom-out" class="nav-button" aria-label="Dézoomer" title="Dézoomer">${icon(Minus)}</button></div>
  </nav>
  <div class="bottom-bar"><span class="area-label">Massat · limite IGN</span><button id="help-toggle" class="help-button" aria-label="Aide et sources" aria-expanded="false" aria-controls="help">${icon(Info)}</button></div>
  <section id="help" class="help" hidden>
    <h2>Explorer la région de Massat</h2>
    <p>Massat s’affiche par défaut. Le sélecteur affiche uniquement la commune choisie ; <b>Toute la région</b> affiche les sept communes. La recherche porte sur le territoire affiché.</p>
    <p>Glissez pour vous déplacer. Utilisez la molette ou pincez l’écran pour zoomer.</p>
    <p>Pour incliner ou tourner la vue : glissez avec le bouton droit, ou avec <kbd>Ctrl</kbd> + clic. Sur écran tactile, utilisez deux doigts.</p>
    <p>Recherchez par exemple <b>F 1444</b>, <b>Liers</b> ou <b>Rue de la Mairie</b>. Un numéro seul affiche les parcelles des différentes sections.</p>
    <p>Activez <b>Parcelles</b> pour voir le cadastre et sélectionner un terrain par clic. <b>2D</b> remet la vue à la verticale ; <b>3D</b> l’incline.</p>
    <p><b>Détails</b> ajoute les arbres et les bâtiments détaillés quand vous zoomez. Désactivez-le pour une vue plus légère ou pour lire les parcelles sous les arbres.</p>
    <p><b>Urbanisme</b> récupère les zones et règlements de la DDT à la demande. <b>Centres proposés</b> montre les périmètres retenus pour le rendu : deux niveaux hors centre, trois rangées de fenêtres au maximum dans les centres, églises et chapelles exceptées. Les hauteurs IGN restent conservées dans les données.</p>
    <small id="data-summary">Sources IGN : limites ADMIN EXPRESS 2026, BD TOPO, CoSIA 2025, relief LiDAR HD et photographies aériennes. Cadastre DGFiP / Etalab. Les arbres, toits et fenêtres sont symboliques ; leurs contours et emprises suivent les données géographiques.</small>
  </section>
  <div id="loading" class="loading" role="status">Chargement de Massat…</div>
  <div id="toast" class="toast" role="status" hidden></div>
  <p id="announcement" class="sr-only" role="status" aria-live="polite"></p>
`;

async function json<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(dataUrl(`${path}.json`), { signal });
  if (!response.ok) throw new Error(`${path} : ${response.status}`);
  return response.json() as Promise<T>;
}
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) { el('toast').textContent = message; el('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el('toast').hidden = true, 5500); }

interface Metadata { bounds: [number, number, number, number]; counts: Record<string, number>; areaKm2: number; communes: { insee: string; name: string; bounds: [number,number,number,number]; areaKm2: number }[]; }

async function start() {
  const searchClient = new SearchClient();
  const [meta, , boundary, communeData] = await Promise.all([
    json<Metadata>('metadata'), searchClient.load('09182'), json<FeatureCollection<MultiPolygon | Polygon>>('boundary'), json<FeatureCollection>('communes'),
  ]);
  let scope = '09182';
  let scopeVersion = 0;
  let scopeRequest: AbortController | undefined;
  const scopeBounds = () => scope ? meta.communes.find(c => c.insee === scope)!.bounds : meta.bounds;
  const scopeName = () => scope ? meta.communes.find(c => c.insee === scope)!.name : 'Toute la région';
  const visibleBoundary = () => scope ? { type: 'FeatureCollection' as const, features: communeData.features.filter(f => f.properties?.insee === scope) } : boundary;
  const vectorPath = () => scope ? `scopes/${scope}/tiles/vector/{z}/{x}/{y}.pbf` : 'tiles/vector/{z}/{x}/{y}.pbf';
  el<HTMLSelectElement>('commune-picker').innerHTML += meta.communes.map(c => `<option value="${c.insee}">${escape(c.name)}</option>`).join('');
  el('data-summary').textContent += ` ${meta.counts.buildingsWithoutHeight} bâtiments sans hauteur restent à plat. Le relief et l’orthophoto sont exportés à 1 m pour cette vue régionale. Le cadastre est indicatif et ne remplace pas un bornage.`;

  const getSource = (name: string) => ({ type: 'geojson' as const, data: dataUrl(`${name === 'places' && scope ? `scopes/${scope}/` : ''}${name}.json`), tolerance: 0, maxzoom: 19 });
  const outside = (): Feature => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [
    [[-180,-85], [180,-85], [180,85], [-180,85], [-180,-85]],
    ...(visibleBoundary() as FeatureCollection<Polygon | MultiPolygon>).features.flatMap(feature => feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates[0]] : feature.geometry.coordinates.map(poly => poly[0])),
  ] } });
  const makeStyle = (): StyleSpecification => ({
    version: 8,
    light: { anchor: 'viewport', color: '#f9f7ef', intensity: .4, position: [1.5, 210, 40] },
    sources: {
      dem: { type: 'raster-dem', tiles: [location.origin + dataUrl(`tiles/dem/{z}/{x}/{y}.${productionData ? 'webp' : 'png'}`)], tileSize: 512, minzoom: 9, maxzoom: 16, encoding: 'mapbox', bounds: scopeBounds() },
      shade: { type: 'raster-dem', tiles: [location.origin + dataUrl(`tiles/dem/{z}/{x}/{y}.${productionData ? 'webp' : 'png'}`)], tileSize: 512, minzoom: 9, maxzoom: 16, encoding: 'mapbox', bounds: scopeBounds() },
      ortho: { type: 'raster', tiles: [location.origin + dataUrl('tiles/ortho/{z}/{x}/{y}.webp')], tileSize: 512, minzoom: 9, maxzoom: 16, bounds: scopeBounds() },
      boundary: { type: 'geojson', data: visibleBoundary(), tolerance: 0 },
      outside: { type: 'geojson', data: outside() },
      regional: { type: 'vector', tiles: [location.origin + dataUrl(vectorPath())], minzoom: 9, maxzoom: 16, bounds: scopeBounds() },
      communes: { type: 'geojson', data: scope ? visibleBoundary() : communeData, tolerance: 0 },
      'commune-labels': getSource('commune-labels'),
      places: getSource('places'),
      selection: { type: 'geojson', data: empty, tolerance: 0 },
      'selected-point': { type: 'geojson', data: empty },
    },
    terrain: { source: 'dem', exaggeration: 1 },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#e8eef0' } },
      { id: 'land', type: 'fill', source: 'boundary', paint: { 'fill-color': '#d7d9ba' } },
      { id: 'cover', type: 'fill', source: 'regional', 'source-layer': 'cover', paint: { 'fill-color': ['match', ['get', 'class'],
        'Feuillu', '#79986a', 'Conifère', '#587c66', 'Pelouse', '#ced5a5', 'Broussaille', '#a6b58b',
        'Culture', '#ded7ae', 'Terre labourée', '#c8b993', 'Vigne', '#bdc995', 'Surface eau', '#83afc0',
        'Zone imperméable', '#d6d4cc', 'Zone perméable', '#d1cdbf', 'Bâtiment', '#d9cdc2', 'Piscine', '#89bdca', '#d4cbb3'], 'fill-antialias': false } },
      { id: 'hillshade', type: 'hillshade', source: 'shade', paint: { 'hillshade-exaggeration': .45, 'hillshade-shadow-color': '#354440', 'hillshade-highlight-color': '#fffae9', 'hillshade-accent-color': '#606d57' } },
      { id: 'ortho', type: 'raster', source: 'ortho', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 180, 'raster-saturation': -.1 } },
      { id: 'water', type: 'line', source: 'regional', 'source-layer': 'water', paint: { 'line-color': '#6b9fb2', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, .6, 17, 2] } },
      { id: 'road-casing', type: 'line', source: 'regional', 'source-layer': 'roads', minzoom: 12, filter: ['==', ['get', 'path'], false], paint: { 'line-color': '#b9b4a2', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.2, 18, 10] } },
      { id: 'roads', type: 'line', source: 'regional', 'source-layer': 'roads', minzoom: 12, filter: ['==', ['get', 'path'], false], paint: { 'line-color': '#f3edde', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, .7, 18, 7] } },
      { id: 'paths', type: 'line', source: 'regional', 'source-layer': 'roads', minzoom: 15, filter: ['==', ['get', 'path'], true], paint: { 'line-color': '#a39476', 'line-width': 1, 'line-dasharray': [2, 2] } },
      { id: 'outside-mask', type: 'fill', source: 'outside', paint: { 'fill-color': '#e8eef0', 'fill-antialias': false } },
      { id: 'commune-border-halo', type: 'line', source: 'communes', paint: { 'line-color': '#fff9e9', 'line-width': 3, 'line-opacity': .65 } },
      { id: 'commune-borders', type: 'line', source: 'communes', paint: { 'line-color': '#6d617a', 'line-width': 1.5, 'line-dasharray': [5, 3], 'line-opacity': .8 } },
      { id: 'commune-labels', type: 'symbol', source: 'commune-labels', filter: ['in', ['get', 'insee'], ['literal', scope ? [scope] : meta.communes.map(c => c.insee)]], maxzoom: 13, layout: { 'text-field': ['get','name'], 'text-font': ['Arial'], 'text-size': 14, 'text-letter-spacing': .035, 'text-allow-overlap': true }, paint: { 'text-color': '#4b405a', 'text-halo-color': '#faf8f0', 'text-halo-width': 2 } },
      { id: 'boundary', type: 'line', source: 'boundary', paint: { 'line-color': '#586b68', 'line-width': 1.5, 'line-dasharray': [4, 2] } },
      { id: 'building-footprints', type: 'fill', source: 'regional', 'source-layer': 'buildings', minzoom: 13, paint: { 'fill-color': '#af9180' } },
      { id: 'buildings', type: 'fill-extrusion', source: 'regional', 'source-layer': 'buildings', minzoom: 13, paint: {
        'fill-extrusion-color': '#d5bdab', 'fill-extrusion-height': ['coalesce', ['get', 'displayHeight'], ['get', 'height']], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true,
      } },
      { id: 'selected-fill', type: 'fill', source: 'selection', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#3788ef', 'fill-opacity': .22 } },
      { id: 'selected-halo', type: 'line', source: 'selection', paint: { 'line-color': '#f6f9fd', 'line-width': 7, 'line-opacity': .85 } },
      { id: 'selected-line', type: 'line', source: 'selection', paint: { 'line-color': '#2573d7', 'line-width': 3 } },
      { id: 'road-labels', type: 'symbol', source: 'regional', 'source-layer': 'roads', minzoom: 15, layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-font': ['Arial'], 'text-size': 11, 'symbol-spacing': 350 }, paint: { 'text-color': '#494b46', 'text-halo-color': '#fbf9ef', 'text-halo-width': 1.4 } },
      { id: 'place-dots', type: 'circle', source: 'places', minzoom: 12, filter: ['step', ['zoom'], ['<=', ['get', 'importance'], 3], 13, ['<=', ['get', 'importance'], 4], 14, true], paint: { 'circle-radius': 2.5, 'circle-color': '#536556', 'circle-stroke-color': '#f8f8ed', 'circle-stroke-width': 1 } },
      { id: 'place-labels', type: 'symbol', source: 'places', minzoom: 12, filter: ['step', ['zoom'], ['<=', ['get', 'importance'], 3], 13, ['<=', ['get', 'importance'], 4], 14, true], layout: {
        'text-field': ['get', 'label'], 'text-font': ['Arial'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 14],
        'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': .6,
        'symbol-sort-key': ['get', 'importance'], 'text-max-width': 12,
      }, paint: { 'text-color': '#243c31', 'text-halo-color': '#f9f9ef', 'text-halo-width': 1.8 } },
      { id: 'selected-point', type: 'circle', source: 'selected-point', paint: { 'circle-radius': 7, 'circle-color': '#2573d7', 'circle-stroke-color': '#f7faff', 'circle-stroke-width': 3 } },
    ],
  });
  const map = new maplibregl.Map({
    container: 'map', style: makeStyle(), center: [1.365, 42.875], zoom: 12, pitch: 55, bearing: 0,
    minZoom: 9, maxZoom: 20, maxPitch: 75, attributionControl: false,
    canvasContextAttributes: { antialias: true },
  });
  // Public diagnostic handle also lets the local validation exercise the real map.
  Object.assign(window, { massatMap: map });
  map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: '© IGN · CoSIA 2025 · Cadastre DGFiP / Etalab' }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left');
  map.getCanvas().setAttribute('aria-label', 'Carte de la région. Flèches pour se déplacer, plus et moins pour zoomer.');
  function fitCommune(animate = true) {
    const mobile = innerWidth <= 680;
    map.fitBounds(scopeBounds(), { padding: { left: mobile ? 25 : 180, right: 65, top: mobile ? 160 : 80, bottom: 100 }, pitch: map.getPitch(), bearing: 0, duration: animate ? duration : 0, maxZoom: 13 });
  }
  updateScopeLabels();
  fitCommune(false);
  const overlays = createOverlays(map, meta.communes, () => scope, clearSelection);
  let ready = false;
  let hadError = false;
  map.on('error', event => {
    console.error(event.error);
    if (!hadError) { hadError = true; toast('Une donnée n’a pas pu être chargée. Rechargez la page si elle manque.'); }
  });
  map.on('style.load', () => {
    ready = true;
    overlays.restore();
    for (const id of ['search', 'parcels', 'satellite', 'details']) (el(id) as HTMLButtonElement).disabled = false;
    if (parcelsVisible) { void ensureParcels(); for (const id of ['parcel-fill','parcel-lines','parcel-labels']) map.setLayoutProperty(id,'visibility','visible'); }
    map.setLayoutProperty('ortho','visibility',satellite ? 'visible' : 'none');
    for (const id of ['cover','hillshade']) map.setLayoutProperty(id,'visibility',satellite ? 'none' : 'visible');
    if (map.getLayer('parcel-lines')) map.setPaintProperty('parcel-lines','line-color',satellite ? '#f2d487' : '#a97630');
    const version = scopeVersion;
    map.once('idle', () => { if (version === scopeVersion) el('loading').hidden = true; });
    el('announcement').textContent = `${scopeName()} : carte et recherche disponibles.`;
    void syncDetails();
  });
  // A large zoom loads a finer DEM after the flight. Align the camera to that
  // final elevation so the selected ground stays centered on steep slopes.
  const alignGround = () => {
    if (map.isMoving()) return;
    const ground = map.queryTerrainElevation(map.getCenter());
    if (ground !== null && ground > 100 && Math.abs(ground - map.getCenterElevation()) > .2) map.setCenterElevation(ground);
  };
  map.on('idle', alignGround);
  map.on('moveend', () => requestAnimationFrame(alignGround));
  map.on('sourcedata', event => { if (event.sourceId === 'dem') requestAnimationFrame(alignGround); });
  let detailsEnabled = true;
  let detailLayer: import('./details').DetailLayer | undefined;
  let detailLoading = false;
  const syncDetails = async () => {
    if (!ready || !map.isStyleLoaded()) return;
    if (!detailsEnabled || map.getZoom() < 14.1) {
      if (detailLayer) { map.removeLayer(detailLayer.id); detailLayer = undefined; }
      return;
    }
    if (detailLayer || detailLoading || map.getZoom() < 14.3) return;
    detailLoading = true;
    try {
      const { DetailLayer } = await import('./details');
      if (!ready || !map.isStyleLoaded() || !detailsEnabled || map.getZoom() < 14.3) return;
      detailLayer = new DetailLayer(toast, scope ? `scopes/${scope}/details` : 'details');
      map.addLayer(detailLayer, 'selected-fill');
    } catch (error) { console.error(error); toast('Les détails ne sont pas disponibles. La carte reste utilisable.'); }
    finally { detailLoading = false; }
  };
  Object.defineProperty(window, 'massatDetails', { configurable: true, get: () => detailLayer?.stats ?? null });
  map.on('zoomend', () => void syncDetails());
  map.on('idle', () => void syncDetails());
  el('details').onclick = () => {
    detailsEnabled = !detailsEnabled;
    el('details').setAttribute('aria-pressed', String(detailsEnabled));
    void syncDetails();
    el('announcement').textContent = detailsEnabled ? 'Les détails apparaissent en zoomant.' : 'Vue légère : arbres et détails des bâtiments désactivés.';
    if (detailsEnabled && map.getZoom() < 14.3) toast('Zoomez vers un hameau pour voir les arbres et les bâtiments détaillés.');
  };
  let parcelsVisible = false;
  let satellite = false;
  const parcelData = new Map<string, Promise<FeatureCollection>>();
  const getParcels = (item: SearchItem) => {
    const commune = productionData ? `${item.commune}/${item.details.section}-${Math.floor((item.details.number ?? 0)/128)}` : item.commune;
    if (!parcelData.has(commune)) {
      if (parcelData.size >= 6) parcelData.delete(parcelData.keys().next().value!);
      parcelData.set(commune, json<FeatureCollection>(`${productionData ? 'parcel-shards' : 'parcels'}/${commune}`).catch(error => { parcelData.delete(commune); throw error; }));
    }
    return parcelData.get(commune)!;
  };
  let parcelLayers = false;
  const ensureParcels = async () => {
    if (parcelLayers) return;
    map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'regional', 'source-layer': 'parcels', minzoom: 14, layout: { visibility: 'none' }, paint: { 'fill-color': '#9a6c2b', 'fill-opacity': .035 } }, 'selected-fill');
    map.addLayer({ id: 'parcel-lines', type: 'line', source: 'regional', 'source-layer': 'parcels', minzoom: 14, layout: { visibility: 'none' }, paint: { 'line-color': '#a97630', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, .65, 18, 1.2], 'line-opacity': .9 } }, 'selected-fill');
    map.addLayer({ id: 'parcel-labels', type: 'symbol', source: 'regional', 'source-layer': 'parcel-labels', minzoom: 17, layout: { visibility: 'none', 'text-field': ['get', 'label'], 'text-font': ['Arial'], 'text-size': 10 }, paint: { 'text-color': '#725020', 'text-halo-color': '#fcf7e8', 'text-halo-width': 1.3 } }, 'place-labels');
    parcelLayers = true;
  };
  el('parcels').onclick = async () => {
    const button = el<HTMLButtonElement>('parcels'); button.disabled = true;
    try {
      await ensureParcels(); parcelsVisible = !parcelsVisible;
      for (const id of ['parcel-fill', 'parcel-lines', 'parcel-labels']) map.setLayoutProperty(id, 'visibility', parcelsVisible ? 'visible' : 'none');
      button.setAttribute('aria-pressed', String(parcelsVisible));
      el('announcement').textContent = parcelsVisible ? 'Parcelles affichées en zoomant.' : 'Parcelles masquées.';
    } catch { toast('Le cadastre n’a pas pu être chargé. Réessayez.'); }
    finally { button.disabled = false; }
  };
  el('satellite').onclick = () => {
    satellite = !satellite;
    map.setLayoutProperty('ortho', 'visibility', satellite ? 'visible' : 'none');
    for (const id of ['cover', 'hillshade']) map.setLayoutProperty(id, 'visibility', satellite ? 'none' : 'visible');
    el('satellite').setAttribute('aria-pressed', String(satellite));
    if (map.getLayer('parcel-lines')) map.setPaintProperty('parcel-lines', 'line-color', satellite ? '#f2d487' : '#a97630');
  };
  el('home').onclick = () => { if (!ready) return; clearSelection(); fitCommune(); };
  el('zoom-in').onclick = () => map.zoomIn({ duration: reducedMotion ? 0 : 250 });
  el('zoom-out').onclick = () => map.zoomOut({ duration: reducedMotion ? 0 : 250 });
  el('compass').onclick = () => map.easeTo({ bearing: 0, duration });
  el('view-mode').onclick = () => map.easeTo({ pitch: map.getPitch() < 15 ? 55 : 0, duration });
  map.on('move', () => {
    const threeD = map.getPitch() >= 15;
    el('view-mode').textContent = threeD ? '2D' : '3D';
    el('view-mode').setAttribute('aria-pressed', String(threeD));
    el('view-mode').setAttribute('aria-label', threeD ? 'Passer en vue de dessus' : 'Passer en vue 3D');
    el('view-mode').title = threeD ? 'Vue de dessus' : 'Vue 3D';
    const svg = el('compass').querySelector('svg')!;
    svg.style.transform = `rotate(${-map.getBearing()}deg)`;
  });
  el('help-toggle').onclick = () => { el('help').hidden = !el('help').hidden; el('help-toggle').setAttribute('aria-expanded', String(!el('help').hidden)); };

  const input = el<HTMLInputElement>('search');
  let filter: SearchKind | 'all' = 'all';
  let results: SearchItem[] = [];
  let active = -1;
  let selected: SearchItem | undefined;
  let selectionVersion = 0;

  let searchVersion = 0;
  let displayedQuery = ''; 
  function closeSearch() { searchVersion++; el('search-results').hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  async function renderResults() {
    const version = ++searchVersion;
    let result;
    try { result = await searchClient.query(input.value,filter); } catch { if(version === searchVersion) toast('La recherche n’est pas disponible. Réessayez.'); return; }
    if(version !== searchVersion) return false; results = result.items; active = -1; displayedQuery = input.value;
    el('clear-search').hidden = !input.value;
    input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-expanded', 'true'); el('search-results').hidden = false;
    el('results-caption').textContent = input.value ? `${numberFormat.format(result.total)} résultat${result.total === 1 ? '' : 's'}${result.total > results.length ? ` · ${results.length} affichés, précisez la recherche` : ''}` : `Rechercher dans ${scope ? scopeName() : 'les sept communes'}`;
    el('result-list').innerHTML = results.length ? results.map((item, index) => `<li role="presentation"><button class="result" id="result-${index}" role="option" aria-selected="false" data-index="${index}">${icon(item.kind === 'parcel' ? Grid2X2 : item.kind === 'road' ? Route : MapPin)}<span><strong>${escape(item.label)}</strong><small>${escape(item.kind === 'parcel' ? `Parcelle · ${item.communeName} · ${areaLabel(item.details.area)}` : item.kind === 'road' ? `Voie · ${item.communeName}` : item.kind === 'commune' ? 'Commune · limites administratives' : `${item.details.nature} · ${item.communeName}`)}</small></span></button></li>`).join('') : '<li class="empty" role="presentation">Aucun résultat dans la région.<small>Essayez un nom plus court, une section et un numéro (F 1444), ou le numéro seul.</small></li>';
    return true;
  }
  input.onfocus = renderResults; input.oninput = () => { active = -1; void renderResults(); };
  el('clear-search').onclick = () => { input.value = ''; input.focus(); renderResults(); };
  document.querySelectorAll<HTMLButtonElement>('.filter').forEach(button => button.onclick = () => {
    filter = button.dataset.kind as SearchKind | 'all';
    document.querySelectorAll('.filter').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    renderResults(); input.focus();
  });
  input.onkeydown = async event => {
    if (event.key === 'Escape') { closeSearch(); input.blur(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (el('search-results').hidden || displayedQuery !== input.value) { if (!await renderResults()) return; }
      if (!results.length) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      document.querySelectorAll('.result').forEach((button, index) => { button.classList.toggle('active', index === active); button.setAttribute('aria-selected', String(index === active)); });
      input.setAttribute('aria-activedescendant', `result-${active}`); el(`result-${active}`).scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') { event.preventDefault(); const chosen = active; const current = await renderResults(); if (current && results.length && !el('search-results').hidden) void select(results[Math.max(chosen, 0)]); }
  };
  el('result-list').onclick = event => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-index]'); if (button) void select(results[Number(button.dataset.index)]); };
  document.addEventListener('pointerdown', event => { if (!(event.target as HTMLElement).closest('.search-card')) closeSearch(); });
  function recenter(item: SearchItem) {
    const mobile = innerWidth <= 680;
    const padding = { left: mobile ? 35 : 415, right: 85, top: mobile ? 375 : 90, bottom: 100 };
    if (item.kind === 'hamlet') map.fitBounds([item.center[0] - .0003, item.center[1] - .0003, item.center[0] + .0003, item.center[1] + .0003], { padding, maxZoom: 16, pitch: map.getPitch(), bearing: map.getBearing(), duration });
    else map.fitBounds(item.bounds, { padding, maxZoom: item.kind === 'parcel' ? 18.3 : item.kind === 'commune' ? 13.5 : 17.5, pitch: map.getPitch(), bearing: map.getBearing(), duration });
  }
  function updateScopeLabels() {
    const name = scopeName();
    el<HTMLSelectElement>('commune-picker').value = scope;
    document.querySelector('.place-title h1')!.textContent = scope ? name : 'Massat & alentours';
    const area = scope ? meta.communes.find(c => c.insee === scope)!.areaKm2 : meta.areaKm2;
    el('region-summary').textContent = `${scope ? 'Commune' : '7 communes'} · ${Math.round(area)} km²`;
    document.querySelector('.area-label')!.textContent = scope ? `${name} · limite IGN` : '7 communes · limites IGN';
    el('home').setAttribute('aria-label',scope ? 'Voir toute la commune' : 'Voir toute la région');
    el('home').title = scope ? `Toute la commune de ${name}` : 'Toute la région';
  }
  async function changeScope(code: string) {
    const version = ++scopeVersion;
    scopeRequest?.abort(); scopeRequest = new AbortController();
    closeSearch(); el<HTMLInputElement>('search').disabled = true;
    el('loading').textContent = `Chargement de ${code ? meta.communes.find(c => c.insee === code)!.name : 'la région'}…`;
    el('loading').hidden = false;
    try {
      await searchClient.load(code, meta.communes.map(c=>c.insee), scopeRequest.signal);
      if (version !== scopeVersion) return;
      overlays.invalidate();
      ready = false;
      for (const id of ['parcels','satellite','details','urbanism','centres']) el<HTMLButtonElement>(id).disabled = true;
      clearSelection(); input.value = ''; el('clear-search').hidden = true;
      if (detailLayer) { map.removeLayer(detailLayer.id); detailLayer = undefined; }
      scope = code;
      parcelData.clear(); parcelLayers = false; updateScopeLabels();
      map.stop(); map.setStyle(makeStyle(), { diff: false }); fitCommune(false);
    } catch (error) {
      if (version !== scopeVersion) return;
      console.error(error); el<HTMLInputElement>('search').disabled = !ready;
      el<HTMLSelectElement>('commune-picker').value = scope; el('loading').hidden = true;
      toast('Cette commune n’a pas pu être chargée. Réessayez.');
    }
  }
  el<HTMLSelectElement>('commune-picker').onchange = event => { void changeScope((event.target as HTMLSelectElement).value); };
  function clearSelection() {
    overlays.clearHighlight();
    selected = undefined; selectionVersion++;
    (map.getSource('selection') as GeoJSONSource | undefined)?.setData(empty);
    (map.getSource('selected-point') as GeoJSONSource | undefined)?.setData(empty);
    el('selection').hidden = true;
  }
  async function select(item: SearchItem) {
    if (!ready) return;
    if (item.kind === 'commune') { await changeScope(item.commune); return; }
    overlays.clearHighlight();
    const version = ++selectionVersion;
    selected = item; input.value = item.label; el('clear-search').hidden = false;
    closeSearch(); input.blur(); el('help').hidden = true; el('help-toggle').setAttribute('aria-expanded', 'false');
    const details = item.kind === 'parcel' ? [
      ['Section', item.details.section], ['Numéro', item.details.number], ['Contenance cadastrale', `${areaLabel(item.details.area)}`],
    ] : item.kind === 'hamlet' ? [['Type de lieu', item.details.nature], ['Altitude du repère', `${numberFormat.format(item.details.elevation ?? 0)} m`]] : [['Commune', item.communeName], ['Tronçons répertoriés', item.details.segments]];
    el('selection').innerHTML = `<div class="selection-heading"><div><p class="eyebrow">${kindNames[item.kind]} · ${escape(item.communeName)}</p><h2>${escape(item.label)}</h2></div><button id="close-selection" class="icon-button" aria-label="Fermer la sélection">${icon(X)}</button></div><div class="selection-body"><dl>${details.map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>${item.kind === 'parcel' ? `<p class="selection-note">Référence : ${escape(item.id)}<br>Contour cadastral indicatif.</p>` : ''}<button id="recenter" class="focus-again">${icon(Crosshair)}Recentrer ici</button></div>`;
    el('selection').hidden = false;
    el('close-selection').onclick = clearSelection;
    el('recenter').onclick = () => selected && recenter(selected);
    (map.getSource('selection') as GeoJSONSource | undefined)?.setData(empty);
    (map.getSource('selected-point') as GeoJSONSource).setData(item.kind === 'hamlet' ? { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: item.center } } : empty);
    recenter(item);
    el('announcement').textContent = `${kindNames[item.kind]} ${item.label} sélectionné. Vue recentrée.`;
    if (item.kind !== 'hamlet') {
      try {
        const collection = item.kind === 'parcel' ? await getParcels(item) : await json<FeatureCollection>(`scopes/${item.commune}/named-roads`);
        if (version !== selectionVersion) return;
        const feature = collection.features.find(feature => feature.id === item.id || feature.properties?.id === item.id);
        if (feature) (map.getSource('selection') as GeoJSONSource).setData(feature);
      } catch { toast('Le contour sélectionné n’a pas pu être chargé. Réessayez.'); }
    }
  }
  map.on('click', event => {
    if (!ready) return;
    closeSearch();
    if (overlays.handleClick(event.point)) return;
    const layers = ['place-labels', 'place-dots', ...(parcelsVisible ? ['parcel-fill'] : [])];
    const feature = map.queryRenderedFeatures(event.point, { layers }).find(feature => typeof feature.properties?.id === 'string');
    if (feature) { const version = scopeVersion; void searchClient.get(String(feature.properties.id)).then(item => { if(item && ready && version === scopeVersion) void select(item); }).catch(() => toast('Cette sélection n’a pas pu être chargée.')); }
  });
  map.on('mousemove', event => {
    if (!ready) return;
    map.getCanvas().style.cursor = overlays.hit(event.point) || map.queryRenderedFeatures(event.point, { layers: ['place-labels', 'place-dots', ...(parcelsVisible ? ['parcel-fill'] : [])] }).length ? 'pointer' : '';
  });
}

start().catch(error => {
  console.error(error); el('loading').hidden = true;
  const panel = document.createElement('div'); panel.className = 'fatal';
  panel.innerHTML = '<section><h2>La carte n’a pas pu s’ouvrir</h2><p>Ouvrez le lanceur « Ouvrir la région de Massat.command ». Le serveur local doit rester ouvert. Un navigateur compatible WebGL est nécessaire.</p><button id="retry">Réessayer</button></section>';
  el('app').append(panel); el('retry').onclick = () => location.reload();
});
