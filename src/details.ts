import { dataUrl } from './data';
import * as THREE from 'three';
import { MercatorCoordinate, type Map as MapLibreMap, type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl';

interface Manifest {
  origin: [number, number]; chunkSize: number;
  trees: { count: number; chunks: Record<string, { file: string; count: number; bytes: number }> };
  buildings: { stride?: number; ids: string[]; vertices: number; bytes: number; chunks: Record<string, { file: string; ids: string[]; vertices: number; bytes: number }> };
}
export class DetailLayer implements CustomLayerInterface {
  id = 'visual-details'; type = 'custom' as const; renderingMode = '3d' as const;
  private map!: MapLibreMap;
  private renderer!: THREE.WebGLRenderer;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private origin!: MercatorCoordinate;
  private scale = 1;
  private transform = new THREE.Matrix4();
  private manifest!: Manifest;
  private cache = new Map<string, Float32Array>();
  private buildingCache = new Map<string, Float32Array>();
  private pendingChunks = new Map<string, Promise<Float32Array>>();
  private buildingKeys = "";
  private buildingIds: string[] = [];
  private trunks!: THREE.InstancedMesh;
  private leaves!: THREE.InstancedMesh;
  private conifers!: THREE.InstancedMesh;
  private buildings?: THREE.Mesh;
  private capacity = matchMedia('(max-width: 680px)').matches ? 6000 : 16000;
  private maxChunks = matchMedia('(max-width: 680px)').matches ? 14 : 26;
  private abort = new AbortController();
  private generation = 0;
  private removed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private detailedBuildings = false;
  stats = { ready: false, trees: 0, capacity: this.capacity, cachedChunks: 0, treeDataBytes: 0, instanceBytes: 0, buildingBytes: 0, drawCalls: 0, triangles: 0, buildingDetail: false, failures: 0, center: [] as number[], buildingCachedChunks: 0, detailedBuildingCount: 0 };
  constructor(private onError: (message: string) => void, private directory = 'details') {}

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.AmbientLight('#f3f3ec', 1.25));
    const light = new THREE.DirectionalLight('#fff1d8', 2.1); light.position.set(-200, -400, 700); this.scene.add(light);
    const fill = new THREE.DirectionalLight('#dce7ef', .65); fill.position.set(200, 300, 200); this.scene.add(fill);
    const material = (colour: string) => new THREE.MeshLambertMaterial({ color: colour, flatShading: true, side: THREE.DoubleSide });
    const trunkGeometry = new THREE.CylinderGeometry(1, 1.2, 1, 5).translate(0, .5, 0).rotateX(Math.PI / 2);
    const leafGeometry = new THREE.IcosahedronGeometry(1, 1);
    const coneGeometry = new THREE.ConeGeometry(1, 1, 7, 1).translate(0, .5, 0).rotateX(Math.PI / 2);
    this.trunks = new THREE.InstancedMesh(trunkGeometry, material('#74614c'), this.capacity);
    this.leaves = new THREE.InstancedMesh(leafGeometry, material('#78946a'), this.capacity);
    this.conifers = new THREE.InstancedMesh(coneGeometry, material('#426a53'), this.capacity);
    for (const mesh of [this.trunks, this.leaves, this.conifers]) {
      mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(mesh);
    }
    this.stats.instanceBytes = this.capacity * (3 * 16 + 2 * 3) * 4;
    map.on('moveend', this.schedule);
    map.on('zoom', this.refreshBuildings);
    map.on('sourcedata', this.terrainChanged);
    void this.load().catch(error => { if (!this.removed) { this.stats.failures++; this.onError('Les détails n’ont pas pu être chargés. La carte reste utilisable.'); console.error(error); } });
  }
  private async load() {
    const response = await fetch(dataUrl(`${this.directory}/manifest.json`), { signal: this.abort.signal });
    if (!response.ok) throw new Error('Manifest details unavailable');
    this.manifest = await response.json();
    this.origin = MercatorCoordinate.fromLngLat(this.manifest.origin);
    this.scale = this.origin.meterInMercatorCoordinateUnits();
    this.transform.makeTranslation(this.origin.x, this.origin.y, 0).scale(new THREE.Vector3(this.scale, -this.scale, this.scale));
    if (this.removed) return;
    this.buildings = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true }));
    this.buildings.frustumCulled = false; this.buildings.visible = false; this.scene.add(this.buildings);
    this.stats.ready = true; this.refreshBuildings();
    await this.updateTrees();
  }
  private refreshBuildings = () => {
    const visible = this.stats.ready && this.map.getZoom() >= 15.5;
    if (this.buildings) this.buildings.visible = visible;
    if (visible === this.detailedBuildings) return;
    this.detailedBuildings = visible; this.stats.buildingDetail = visible;
    // Retain all unknown-height footprints and any unmodelled building as fallback.
    this.map.setFilter('buildings', visible ? ['!', ['in', ['get', 'id'], ['literal', this.buildingIds]]] : null);
    this.map.triggerRepaint();
  };
  private terrainChanged = (event: { sourceId?: string }) => { if (event.sourceId === 'dem' && !this.map.isMoving()) this.schedule(); };
  private schedule = () => {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.updateTrees().catch(error => { if (!this.removed && error.name !== 'AbortError') { this.stats.failures++; console.error(error); this.onError('Certains arbres n’ont pas pu être chargés.'); } }); }, 180);
  };
  private chunk(file: string): Promise<Float32Array> {
    const existing = this.pendingChunks.get(file);
    if (existing) return existing;
    const request = fetch(dataUrl(`${this.directory}/${file}`), { signal: this.abort.signal }).then(async response => {
      if (!response.ok) throw new Error(`Detail tile ${file}`);
      return new Float32Array(await response.arrayBuffer());
    }).finally(() => { this.pendingChunks.delete(file); });
    this.pendingChunks.set(file, request);
    return request;
  }
  private async updateTrees() {
    if (!this.stats.ready || this.removed || this.map.isMoving()) return;
    const generation = ++this.generation;
    const zoom = this.map.getZoom();
    if (zoom < 14.3) { for (const mesh of [this.trunks, this.leaves, this.conifers]) mesh.count = 0; this.stats.trees = 0; this.map.triggerRepaint(); return; }
    const mercator = MercatorCoordinate.fromLngLat(this.map.getCenter());
    const cx = (mercator.x - this.origin.x) / this.scale, cy = (this.origin.y - mercator.y) / this.scale;
    const radius = Math.max(650, Math.min(2400, 1700 * 2 ** (15 - zoom)));
    const size = this.manifest.chunkSize;
    const bounds = this.map.getBounds();
    const southwest = MercatorCoordinate.fromLngLat(bounds.getSouthWest()), northeast = MercatorCoordinate.fromLngLat(bounds.getNorthEast());
    const left = (southwest.x - this.origin.x) / this.scale - 100, right = (northeast.x - this.origin.x) / this.scale + 100;
    const bottom = (this.origin.y - southwest.y) / this.scale - 100, top = (this.origin.y - northeast.y) / this.scale + 100;
    const tiles = [...new Set([...Object.keys(this.manifest.trees.chunks), ...Object.keys(this.manifest.buildings.chunks)])].map(key => {
      const [x,y] = key.split('_').map(Number); return { key, x: x * size, y: y * size, distance: (x * size + size / 2 - cx) ** 2 + (y * size + size / 2 - cy) ** 2 };
    }).filter(t => t.distance < (radius + size) ** 2 && t.x + size > left && t.x < right && t.y + size > bottom && t.y < top)
      .sort((a,b) => a.distance - b.distance).slice(0, this.maxChunks);
    const needed = new Set(tiles.map(t => t.key));
    for (const key of this.cache.keys()) if (!needed.has(key)) this.cache.delete(key);
    for (const key of this.buildingCache.keys()) if (!needed.has(key) || zoom < 15.5) this.buildingCache.delete(key);
    const [loaded, buildingData] = await Promise.all([Promise.all(tiles.filter(tile => this.manifest.trees.chunks[tile.key]).map(async tile => {
      if (this.cache.has(tile.key)) return [tile.key, this.cache.get(tile.key)!] as const;
      return [tile.key, await this.chunk(this.manifest.trees.chunks[tile.key].file)] as const;
    })), Promise.all(tiles.filter(tile => zoom >= 15.5 && this.manifest.buildings.chunks[tile.key]).map(async tile => {
      if (this.buildingCache.has(tile.key)) return [tile.key, this.buildingCache.get(tile.key)!] as const;
      return [tile.key, await this.chunk(this.manifest.buildings.chunks[tile.key].file)] as const;
    }))]);
    if (generation !== this.generation || this.removed || this.map.isMoving()) return;
    for (const [key, data] of loaded) this.cache.set(key, data);
    for (const [key, data] of buildingData) this.buildingCache.set(key, data);
    const signature = buildingData.map(([key]) => key).sort().join(',');
    if (signature !== this.buildingKeys) {
      this.buildingKeys = signature;
      const merged = new Float32Array(buildingData.reduce((sum,[,data]) => sum + data.length,0));
      let offset = 0;
      for (const [,data] of buildingData) { merged.set(data,offset); offset += data.length; }
      const geometry = new THREE.BufferGeometry();
      const stride = this.manifest.buildings.stride ?? 6;
      const buffer = new THREE.InterleavedBuffer(merged,stride);
      geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));
      geometry.setAttribute('color',new THREE.InterleavedBufferAttribute(buffer,3,3));
      if (stride === 9) geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(buffer,3,6));
      else geometry.computeVertexNormals();
      if (this.buildings) { this.buildings.geometry.dispose(); this.buildings.geometry = geometry; }
      this.buildingIds = buildingData.flatMap(([key]) => this.manifest.buildings.chunks[key].ids);
      this.stats.buildingBytes = merged.byteLength * (stride === 9 ? 1 : 1.5);
      this.detailedBuildings = false;
      this.refreshBuildings();
    }
    const candidates: { data: Float32Array; i: number; distance: number; hash: number }[] = [];
    for (const [,data] of loaded) for (let i = 0; i < data.length; i += 6) {
      const x = data[i], y = data[i+1], distance = (x-cx)**2 + (y-cy)**2;
      if (distance > radius**2 || x < left || x > right || y < bottom || y > top) continue;
      const hash = ((Math.floor(x * 10) * 73856093) ^ (Math.floor(y * 10) * 19349663)) >>> 0;
      // Sparse distant silhouettes, dense nearby crowns; stable across camera motion.
      const stride = distance > 1300**2 ? 9 : distance > 750**2 ? 3 : 1;
      if (hash % stride === 0) candidates.push({ data, i, distance, hash });
    }
    candidates.sort((a,b) => a.distance - b.distance);
    const dummy = new THREE.Object3D(); const colour = new THREE.Color();
    let deciduous = 0, conifer = 0, count = 0;
    for (const row of candidates.slice(0, this.capacity)) {
      const [x,y,nativeZ,height,radius,type] = row.data.subarray(row.i, row.i + 6);
      const point = new MercatorCoordinate(this.origin.x + x * this.scale, this.origin.y - y * this.scale).toLngLat();
      const elevation = this.map.queryTerrainElevation(point);
      const z = elevation !== null && elevation > 100 ? MercatorCoordinate.fromLngLat(point,elevation).z / this.scale : nativeZ;
      dummy.position.set(x,y,z-.4); dummy.rotation.set(0,0,0); dummy.scale.set(radius*.085,radius*.085,height*.7); dummy.updateMatrix(); this.trunks.setMatrixAt(count, dummy.matrix);
      dummy.rotation.z = (row.hash % 628) / 100;
      if (type === 2) {
        dummy.position.z = z + height * .12; dummy.scale.set(radius,radius,height*.9); dummy.updateMatrix();
        this.conifers.setMatrixAt(conifer,dummy.matrix); colour.setHSL(.36, .2, .67 + (row.hash%11)/100); this.conifers.setColorAt(conifer++, colour);
      } else {
        dummy.position.z = z + height * .63; dummy.scale.set(radius,radius*.91,height*.38); dummy.updateMatrix();
        this.leaves.setMatrixAt(deciduous,dummy.matrix); colour.setHSL(.24 + (row.hash%9)/500, .19, .63 + (row.hash%17)/100); this.leaves.setColorAt(deciduous++, colour);
      }
      count++;
    }
    this.trunks.count = count; this.leaves.count = deciduous; this.conifers.count = conifer;
    for (const mesh of [this.trunks, this.leaves, this.conifers]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
    this.stats.trees = count; this.stats.cachedChunks = this.cache.size;
    this.stats.center = this.map.getCenter().toArray(); this.stats.buildingCachedChunks = this.buildingCache.size; this.stats.detailedBuildingCount = this.buildingIds.length;
    this.stats.treeDataBytes = [...this.cache.values()].reduce((sum,data) => sum + data.byteLength,0);
    this.map.triggerRepaint();
  }
  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    if (!this.stats.ready || this.map.getZoom() < 14.3) return;
    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix).multiply(this.transform);
    this.renderer.resetState(); this.renderer.render(this.scene, this.camera);
    this.stats.drawCalls = this.renderer.info.render.calls; this.stats.triangles = this.renderer.info.render.triangles;
    // No perpetual triggerRepaint: a stationary view consumes no animation loop.
  }
  onRemove() {
    this.removed = true; this.generation++; this.abort.abort(); clearTimeout(this.timer);
    this.map.off('moveend',this.schedule); this.map.off('zoom',this.refreshBuildings); this.map.off('sourcedata',this.terrainChanged);
    if (this.detailedBuildings && this.map.getLayer('buildings')) this.map.setFilter('buildings',null);
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); if (object instanceof THREE.InstancedMesh) object.dispose(); }
    });
    this.renderer.dispose(); this.pendingChunks.clear(); this.cache.clear(); this.buildingCache.clear(); this.scene.clear(); this.stats.ready = false;
  }
}
