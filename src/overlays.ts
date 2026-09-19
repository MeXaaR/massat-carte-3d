import type { Map as MapView, GeoJSONSource, PointLike, ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { fetchUrbanism, officialMap, type Commune, type UrbanismResult, type Zone } from './urbanism-api';

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const colours: ExpressionSpecification = ['match', ['get', 'family'], 'U', '#ce608c', 'AU', '#ed9d39', 'A', '#d1bd3e', 'N', '#438b72', 'CC', '#8480c5', '#758896'];
const formatDate = (value: string) => /^\d{8}$/.test(value) ? `${value.slice(6)}/${value.slice(4, 6)}/${value.slice(0, 4)}` : value || 'Non renseignée';
const stamp = (time: number) => new Date(time).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

export function createOverlays(map: MapView, communes: Commune[], scope: () => string, clearSelection: () => void) {
  let active = false, loading = false, generation = 0, request: AbortController | undefined;
  let current: UrbanismResult | undefined;
  let zoneSelected = false;
  const source = (id: string) => map.getSource(id) as GeoJSONSource | undefined;
  const setZones = (data: FeatureCollection) => source('urbanism')?.setData(data);

  function clearHighlight() {
    source('urbanism-selection')?.setData(empty);
    zoneSelected = false;
  }
  function clearZoneSelection() { if (zoneSelected) clearSelection(); }
  function status(message: string) { el('urbanism-status').textContent = message; }
  function showResult(result: UrbanismResult) {
    current = result; setZones(active ? result.data : empty);
    const count = result.data.features.length;
    status(`${count} zone${count === 1 ? '' : 's'} · récupéré le ${stamp(result.fetchedAt)}`);
    el('urbanism-coverage').textContent = [result.empty.length ? `Aucun zonage disponible dans ce service : ${result.empty.join(', ')}.` : '', result.failed.length ? `Service indisponible pour ${result.failed.join(', ')}. Nouvelle tentative automatique.` : ''].filter(Boolean).join(' ');
  }
  async function load() {
    request?.abort(); request = new AbortController();
    const signal = request.signal, version = ++generation, code = scope();
    loading = true;
    clearZoneSelection(); current = undefined; setZones(empty);
    el('urbanism-coverage').textContent = '';
    status('Récupération des zones auprès de la DDT…');
    try {
      const result = await fetchUrbanism(communes.filter(c => !code || c.insee === code), signal);
      if (version !== generation) return;
      showResult(result);
    } catch {
      if (version !== generation) return;
      status('Le service d’urbanisme est indisponible.');
      el('urbanism-coverage').textContent = 'La carte reste utilisable. Une nouvelle tentative sera faite automatiquement. Vous pouvez aussi consulter la carte officielle.';
    } finally { if (version === generation) loading = false; }
  }
  function invalidate() { request?.abort(); generation++; loading = false; current = undefined; }
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
  function restore() {
    for (const id of ['urbanism', 'urbanism-selection']) map.addSource(id, { type: 'geojson', data: empty, tolerance: 0, ...(id === 'urbanism' ? { attribution: `<a href="${officialMap}" target="_blank" rel="noopener noreferrer">Urbanisme : DDT 09</a>` } : {}) });
    map.addLayer({ id: 'urbanism-fill', type: 'fill', source: 'urbanism', paint: { 'fill-color': colours, 'fill-opacity': .34 } }, 'outside-mask');
    map.addLayer({ id: 'urbanism-line', type: 'line', source: 'urbanism', paint: { 'line-color': colours, 'line-width': 1.8 } }, 'outside-mask');
    map.addLayer({ id: 'urbanism-labels', type: 'symbol', source: 'urbanism', minzoom: 12, layout: { 'text-field': ['get', 'code'], 'text-font': ['Arial'], 'text-size': 13, 'text-padding': 12 }, paint: { 'text-color': '#342b44', 'text-halo-color': '#fffdf5', 'text-halo-width': 2 } }, 'outside-mask');
    map.addLayer({ id: 'urbanism-selection-fill', type: 'fill', source: 'urbanism-selection', paint: { 'fill-color': '#2374dc', 'fill-opacity': .17 } }, 'outside-mask');
    map.addLayer({ id: 'urbanism-selection-line', type: 'line', source: 'urbanism-selection', paint: { 'line-color': '#155ac8', 'line-width': 4 } }, 'outside-mask');
    el<HTMLButtonElement>('urbanism').disabled = false;
    void load();
  }
  el('urbanism').onclick = () => {
    active = !active;
    el('urbanism').setAttribute('aria-pressed', String(active)); el('urbanism-panel').hidden = !active;
    if (active) {
      if (current && Date.now() - current.fetchedAt < 15 * 60_000) showResult(current);
      else if (!loading) void load();
    } else { setZones(empty); clearZoneSelection(); }
  };
  // Refresh on returning to a long-open map, as well as every 15 minutes while visible.
  const refreshIfOld = () => { if (active && !document.hidden && !el<HTMLButtonElement>('urbanism').disabled && (!current || current.failed.length || Date.now() - current.fetchedAt > 15 * 60_000) && !loading) void load(); };
  setInterval(refreshIfOld, 60_000);
  document.addEventListener('visibilitychange', refreshIfOld);
  return { restore, clearHighlight, invalidate, hit, handleClick(point: PointLike) { const zone = hit(point); if (!zone) return false; selectZone(zone); return true; } };
}
