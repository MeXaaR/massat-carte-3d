import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson';

export const officialMap = 'https://carto2.geo-ide.din.developpement-durable.gouv.fr/frontoffice/?map=d8de8132-4e9f-4a0a-b3d5-cf9d980c321c';
const metadataUrl = 'https://carto2.geo-ide.din.developpement-durable.gouv.fr/rest-api/v1/public/Maps/d8de8132-4e9f-4a0a-b3d5-cf9d980c321c';
export interface Commune { insee: string; name: string; }
export type Zone = Feature<Polygon | MultiPolygon, { id: string; commune: string; communeName: string; kind: string; code: string; family: string; description: string; date: string; endDate: string; url: string }>;
export interface UrbanismResult { data: FeatureCollection<Polygon | MultiPolygon, Zone['properties']>; fetchedAt: number; empty: string[]; failed: string[]; }
interface Layer { title?: string; children?: Layer[]; views?: { layerName: string; services?: { wfs?: { serviceUrl: string } } }[]; }
interface Service { kind: string; name: string; url: string; }
export function safeUrl(value: unknown): string {
  try { const url = new URL(String(value ?? '')); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function family(code: string, kind: string): string {
  if (kind === 'Carte communale') return 'CC';
  const upper = code.toUpperCase();
  return upper.startsWith('AU') ? 'AU' : ['U', 'A', 'N'].includes(upper[0]) ? upper[0] : 'Autre';
}
export function servicesFromMetadata(layers: Layer[]): Service[] {
  const all = layers.flatMap(layer => [layer, ...flatten(layer.children ?? [])]);
  return [['ZONES DES PLU', 'PLU / PLUi'], ['SECTEURS DES CARTES COMMUNALES', 'Carte communale']].map(([title, kind]) => {
    const view = all.find(layer => layer.title === title)?.views?.find(view => view.services?.wfs);
    const url = safeUrl(view?.services?.wfs?.serviceUrl);
    if (!view || !url.startsWith('https://')) throw new Error('Le service de zonage a changé.');
    return { kind, name: view.layerName, url };
  });
}
function flatten(layers: Layer[]): Layer[] { return layers.flatMap(layer => [layer, ...flatten(layer.children ?? [])]); }
export function featureUrl(service: Service, insee: string): string {
  if (!/^\d{5}$/.test(insee)) throw new Error('Code commune invalide');
  const url = new URL(service.url);
  const params = { SERVICE: 'WFS', VERSION: '1.1.0', REQUEST: 'GetFeature', TYPENAME: service.name, OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', MAXFEATURES: '10000', FILTER: `<Filter xmlns="http://www.opengis.net/ogc"><PropertyIsEqualTo><PropertyName>INSEE</PropertyName><Literal>${insee}</Literal></PropertyIsEqualTo></Filter>` };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}
async function getJson(url: string, signal: AbortSignal): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`Service indisponible (${response.status})`);
  return response.json();
}
export async function fetchUrbanism(communes: Commune[], signal: AbortSignal): Promise<UrbanismResult> {
  const metadata = await getJson(metadataUrl, signal);
  const services = servicesFromMetadata(metadata.layers);
  const features: Zone[] = [], empty: string[] = [], failed: string[] = [];
  // Three communes at a time keeps the public DDT service load bounded.
  for (let offset = 0; offset < communes.length; offset += 3) {
    signal.throwIfAborted();
    await Promise.all(communes.slice(offset, offset + 3).map(async commune => {
      try {
        const collections = await Promise.all(services.map(service => getJson(featureUrl(service, commune.insee), signal)));
        const zones: Zone[] = collections.flatMap((collection, serviceIndex) => {
          if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || collection.features.length >= 10000) throw new Error('Réponse de zonage incomplète');
          const service = services[serviceIndex];
          return collection.features.map((feature: Feature, index: number): Zone => {
            if (!feature.geometry || !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) throw new Error('Géométrie de zonage invalide');
            const p = feature.properties ?? {}, code = String(p.LIBELLE || 'Sans code');
            const id = `${commune.insee}:${service.name}:${feature.id ?? index}`;
            return { type: 'Feature', id, geometry: feature.geometry as Polygon | MultiPolygon, properties: { id, commune: commune.insee, communeName: commune.name, kind: service.kind, code, family: family(code, service.kind), description: String(p.LIBELONG ?? ''), date: String(p.DATAPPRO ?? ''), endDate: String(p.DATFIN ?? ''), url: safeUrl(p.URLFIC) } };
          });
        });
        features.push(...zones);
        if (!zones.length) empty.push(commune.name);
      } catch { signal.throwIfAborted(); failed.push(commune.name); }
    }));
  }
  signal.throwIfAborted();
  return { data: { type: 'FeatureCollection', features }, fetchedAt: Date.now(), empty, failed };
}
