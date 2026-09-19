import type { Map as MapView, GeoJSONSource, PointLike, ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { dataUrl } from './data';
import { fetchUrbanism, officialMap, type Commune, type UrbanismResult, type Zone } from './urbanism-api';

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const colours: ExpressionSpecification = ['match', ['get', 'family'], 'U', '#ce608c', 'AU', '#ed9d39', 'A', '#d1bd3e', 'N', '#438b72', 'CC', '#8480c5', '#758896'];
const formatDate = (value: string) => /^\d{8}$/.test(value) ? `${value.slice(6)}/${value.slice(4, 6)}/${value.slice(0, 4)}` : value || 'Non renseignée';
const stamp = (time: number) => new Date(time).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export function createOverlays(map: MapView, communes: Commune[], scope: () => string, clearSelection: () => void) {
  let active = false, centresActive = false, generation = 0, request: AbortController | undefined;
  let current: UrbanismResult | undefined, centres: FeatureCollection | undefined;
  let centreRequest: Promise<FeatureCollection> | undefined;
  let zoneSelected = false;
  const cache = new Map<string, UrbanismResult>();
  const source = (id: string) => map.getSource(id) as GeoJSONSource | undefined;
  const setZones = (data: FeatureCollection) => source('urbanism')?.setData(data);

  function clearHighlight() {
    source('urbanism-selection')?.setData(empty);
    zoneSelected = false;
  }
  function clearZoneSelection() { if (zoneSelected) clearSelection(); }
  function status(message: string) { el('urbanism-status').textContent = message; }
  function showResult(result: UrbanismResult) {
    current = result; setZones(result.data);
    const count = result.data.features.length;
    status(`${count} zone${count === 1 ? '' : 's'} · récupéré le ${stamp(result.fetchedAt)}`);
    el('urbanism-coverage').textContent = [result.empty.length ? `Aucun zonage disponible dans ce service : ${result.empty.join(', ')}.` : '', result.failed.length ? `Service indisponible pour ${result.failed.join(', ')}. Réessayez avec Actualiser.` : ''].filter(Boolean).join(' ');
  }
  async function load(force = false) {
    request?.abort(); request = new AbortController();
    const signal = request.signal, version = ++generation, code = scope();
    clearZoneSelection(); current = undefined; setZones(empty);
    el('urbanism-coverage').textContent = '';
    const saved = cache.get(code);
    if (!force && saved && Date.now() - saved.fetchedAt < 5 * 60_000) { showResult(saved); el<HTMLButtonElement>('urbanism-refresh').disabled = false; return; }
    status('Récupération des zones auprès de la DDT…');
    el<HTMLButtonElement>('urbanism-refresh').disabled = true;
    try {
      const result = await fetchUrbanism(communes.filter(c => !code || c.insee === code), signal);
      if (version !== generation || !active) return;
      if (!result.failed.length) cache.set(code, result);
      showResult(result);
    } catch {
      if (version !== generation || !active) return;
      status('Le service d’urbanisme est indisponible.');
      el('urbanism-coverage').textContent = 'La carte reste utilisable. Réessayez avec Actualiser ou consultez la carte officielle.';
    } finally { if (version === generation) el<HTMLButtonElement>('urbanism-refresh').disabled = false; }
  }
  function invalidate() { request?.abort(); generation++; current = undefined; }
  function hit(point: PointLike): Zone | undefined {
    if (!active || !current || !map.getLayer('urbanism-fill') || !map.getLayer('land')) return;
    if (!map.queryRenderedFeatures(point, { layers: ['land'] }).length) return;
    const feature = map.queryRenderedFeatures(point, { layers: ['urbanism-fill'] })[0];
    return feature && current.data.features.find(zone => zone.id === feature.properties.id);
  }
  function selectZone(zone: Zone) {
    clearSelection(); zoneSelected = true;
    source('urbanism-selection')?.setData(zone);
    const p = zone.properties;
    el('selection').innerHTML = `<div class="selection-heading"><div><p class="eyebrow">${escape(p.kind)} · ${escape(p.communeName)}</p><h2>Zone ${escape(p.code)}</h2></div><button id="close-zone" class="icon-button" aria-label="Fermer la sélection">×</button></div>
      <div class="selection-body"><dl><div><dt>Date du document¹</dt><dd>${escape(formatDate(p.date))}</dd></div>${p.endDate ? `<div><dt>Date de fin</dt><dd>${escape(formatDate(p.endDate))}</dd></div>` : ''}</dl>
      ${p.description ? `<p class="urbanism-note">${escape(p.description)}</p>` : ''}
      ${p.url ? `<a class="focus-again" href="${escape(p.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le règlement officiel ↗</a>` : '<p class="urbanism-note">Aucun règlement lié dans la source.</p>'}
      <p class="urbanism-note">Recherchez « ${escape(p.code)} » dans le règlement pour lire les dispositions de cette zone. Le lien ouvre le document fourni par la DDT.</p>
      <p class="urbanism-note">¹ Date renseignée par la DDT. Données récupérées le ${escape(stamp(current!.fetchedAt))}. Les autres prescriptions sont à consulter sur la <a href="${officialMap}" target="_blank" rel="noopener noreferrer">carte officielle</a>.</p></div>`;
    el('selection').hidden = false;
    el('close-zone').onclick = clearSelection;
    el('announcement').textContent = `Zone ${p.code}, ${p.communeName}. Règlement disponible dans la fiche.`;
  }
  async function showCentres() {
    if (!centresActive) { source('town-centres')?.setData(empty); return; }
    try {
      if (!centres) {
        centreRequest ??= fetch(dataUrl('town-centres.json')).then(response => { if (!response.ok) throw Error('Centres indisponibles'); return response.json(); }).finally(() => { centreRequest = undefined; });
        centres = await centreRequest;
      }
      if (!centresActive) return;
      const visible = { type: 'FeatureCollection' as const, features: centres!.features.filter(f => !scope() || f.properties?.commune === scope()) };
      source('town-centres')?.setData(visible);
      el('centres-list').innerHTML = visible.features.map((f, index) => `<button class="centre-link" data-centre="${index}">${escape(f.properties?.label)} · ${Number(f.properties?.areaHa).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ha</button>`).join('');
      el('centres-list').onclick = event => {
        const button = (event.target as HTMLElement).closest<HTMLElement>('[data-centre]');
        const feature = button && visible.features[Number(button.dataset.centre)];
        if (feature) map.fitBounds(feature.properties!.bounds, { padding: { left: innerWidth > 680 ? 410 : 30, right: 65, top: innerWidth > 680 ? 80 : 290, bottom: 100 }, maxZoom: 16, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 850 });
      };
    } catch { el('centres-list').textContent = 'Les périmètres n’ont pas pu être chargés. Désactivez puis réactivez ce bouton pour réessayer.'; }
  }
  function restore() {
    for (const id of ['urbanism', 'urbanism-selection', 'town-centres']) map.addSource(id, { type: 'geojson', data: empty, tolerance: 0, ...(id === 'urbanism' ? { attribution: `<a href="${officialMap}" target="_blank" rel="noopener noreferrer">Urbanisme : DDT 09</a>` } : {}) });
    map.addLayer({ id: 'urbanism-fill', type: 'fill', source: 'urbanism', paint: { 'fill-color': colours, 'fill-opacity': .34 } }, 'outside-mask');
    map.addLayer({ id: 'urbanism-line', type: 'line', source: 'urbanism', paint: { 'line-color': colours, 'line-width': 1.8 } }, 'outside-mask');
    map.addLayer({ id: 'urbanism-labels', type: 'symbol', source: 'urbanism', minzoom: 12, layout: { 'text-field': ['get', 'code'], 'text-font': ['Arial'], 'text-size': 13, 'text-padding': 12 }, paint: { 'text-color': '#342b44', 'text-halo-color': '#fffdf5', 'text-halo-width': 2 } }, 'outside-mask');
    map.addLayer({ id: 'urbanism-selection-fill', type: 'fill', source: 'urbanism-selection', paint: { 'fill-color': '#2374dc', 'fill-opacity': .17 } }, 'outside-mask');
    map.addLayer({ id: 'urbanism-selection-line', type: 'line', source: 'urbanism-selection', paint: { 'line-color': '#155ac8', 'line-width': 4 } }, 'outside-mask');
    map.addLayer({ id: 'town-centres-fill', type: 'fill', source: 'town-centres', paint: { 'fill-color': '#7040b0', 'fill-opacity': .12 } }, 'outside-mask');
    map.addLayer({ id: 'town-centres-line', type: 'line', source: 'town-centres', paint: { 'line-color': '#7040b0', 'line-width': 3, 'line-dasharray': [3, 2] } }, 'outside-mask');
    el<HTMLButtonElement>('urbanism').disabled = false;
    el<HTMLButtonElement>('centres').disabled = false;
    if (active) void load();
    if (centresActive) void showCentres();
  }
  el('urbanism').onclick = () => {
    active = !active;
    el('urbanism').setAttribute('aria-pressed', String(active)); el('urbanism-panel').hidden = !active;
    if (active) void load();
    else { invalidate(); setZones(empty); clearZoneSelection(); }
  };
  el('urbanism-refresh').onclick = () => { if (active) void load(true); };
  el('centres').onclick = () => {
    centresActive = !centresActive;
    el('centres').setAttribute('aria-pressed', String(centresActive)); el('centres-panel').hidden = !centresActive;
    void showCentres();
  };
  // Refresh on returning to a long-open map, as well as every 15 minutes while visible.
  const refreshIfOld = () => { if (active && !document.hidden && !el<HTMLButtonElement>('urbanism').disabled && (!current || Date.now() - current.fetchedAt > 15 * 60_000) && !el<HTMLButtonElement>('urbanism-refresh').disabled) void load(true); };
  setInterval(refreshIfOld, 60_000);
  document.addEventListener('visibilitychange', refreshIfOld);
  return { restore, clearHighlight, invalidate, hit, handleClick(point: PointLike) { const zone = hit(point); if (!zone) return false; selectZone(zone); return true; } };
}
