import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchUrbanism, featureUrl, safeUrl, servicesFromMetadata, family } from './urbanism-api.ts';
const service = (title: string, name: string) => ({ title, views: [{ layerName: name, services: { wfs: { serviceUrl: 'https://example.test/wfs' } } }] });
const metadata = { layers: [{ children: [service('ZONES DES PLU', 'PLU'), service('SECTEURS DES CARTES COMMUNALES', 'CC')] }] };
const zone = { type: 'Feature', id: 4, properties: { LIBELLE: 'AU0', DATAPPRO: '20260521', URLFIC: 'https://example.test/current.pdf' }, geometry: { type: 'Polygon', coordinates: [[[1,43],[1.1,43],[1.1,43.1],[1,43]]] } };
test('discovers WFS services inside nested groups and filters the exact commune', () => {
  const services = servicesFromMetadata(metadata.layers);
  assert.equal(services.length, 2);
  const url = new URL(featureUrl(services[0], '09182'));
  assert.match(url.searchParams.get('FILTER')!, /<PropertyName>INSEE<\/PropertyName><Literal>09182<\/Literal>/);
  assert.equal(url.searchParams.get('SRSNAME'), 'EPSG:4326');
  assert.throws(() => featureUrl(services[0], '<injection>'));
});
test('links accept web documents only and zone families preserve AU before A', () => {
  assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl('/relative'), '');
  assert.equal(family('AU0', 'PLU / PLUi'), 'AU'); assert.equal(family('Nh', 'PLU / PLUi'), 'N');
  assert.equal(family('ZC', 'Carte communale'), 'CC');
});
test('fresh calls return changed codes, names and regulation links; failures differ from empty coverage', async t => {
  let revision = 1;
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input)); calls.push(url.href);
    if (url.pathname.includes('/Maps/')) return Response.json(metadata);
    const filter = url.searchParams.get('FILTER')!;
    if (filter.includes('09280')) throw Error('Service unavailable');
    if (filter.includes('09057') || url.searchParams.get('TYPENAME') === 'CC') return Response.json({ type: 'FeatureCollection', features: [] });
    return Response.json({ type: 'FeatureCollection', features: [{ ...zone, properties: { ...zone.properties, LIBELLE: revision === 1 ? 'AU0' : 'UB', URLFIC: `https://example.test/v${revision}.pdf` } }] });
  });
  const communes = [{ insee: '09182', name: 'Massat' }, { insee: '09057', name: 'Biert' }, { insee: '09280', name: 'Saurat' }];
  const first = await fetchUrbanism(communes, new AbortController().signal);
  assert.equal(first.data.features[0].properties.code, 'AU0');
  assert.equal(first.data.features[0].properties.commune, '09182');
  assert.deepEqual(first.empty, ['Biert']); assert.deepEqual(first.failed, ['Saurat']);
  revision = 2;
  const second = await fetchUrbanism(communes.slice(0,1), new AbortController().signal);
  assert.equal(second.data.features[0].properties.code, 'UB');
  assert.equal(second.data.features[0].properties.url, 'https://example.test/v2.pdf');
  assert.equal(calls.length, 10);
});
test('XML errors and truncated results are reported as failures, never empty zoning', async t => {
  let truncate = false;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    if (String(input).includes('/Maps/')) return Response.json(metadata);
    return truncate ? Response.json({ type: 'FeatureCollection', features: Array(10000).fill(zone) }) : new Response('<ServiceException>Unavailable</ServiceException>');
  });
  for (const value of [false, true]) {
    truncate = value;
    const result = await fetchUrbanism([{ insee: '09182', name: 'Massat' }], new AbortController().signal);
    assert.deepEqual(result.failed, ['Massat']); assert.deepEqual(result.empty, []); assert.equal(result.data.features.length, 0);
  }
});
test('aborting a scope propagates cancellation', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => { controller.abort(); return Response.json(metadata); });
  await assert.rejects(fetchUrbanism([{ insee: '09182', name: 'Massat' }], controller.signal), { name: 'AbortError' });
});
