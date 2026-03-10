// ═══════════════════════════════════════════════════════════
//   de_dust2  —  Three.js Map Geometry
//   Simplified but recognizable layout
// ═══════════════════════════════════════════════════════════

const MAP = {
  scene: null,
  colliders: [],   // AABB boxes for collision: {minX,maxX,minZ,maxZ,minY,maxY}

  init(scene) {
    this.scene = scene;
    this.colliders = [];
    this._buildMap();
  },

  _mat(color, roughness = 0.9, metalness = 0) {
    return new THREE.MeshLambertMaterial({ color });
  },

  _box(x, y, z, w, h, d, color, collide = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = this._mat(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);

    if (collide) {
      this.colliders.push({
        minX: x - w / 2, maxX: x + w / 2,
        minY: y - h / 2, maxY: y + h / 2,
        minZ: z - d / 2, maxZ: z + d / 2,
      });
    }
    return mesh;
  },

  _buildMap() {
    const S = this.scene;

    // ── COLORS ───────────────────────────────────────────────
    const SAND      = 0xc8a96a;
    const SAND_DARK = 0xb8924a;
    const WALL      = 0xb09060;
    const WALL2     = 0xa07840;
    const ROOF      = 0x988050;
    const STONE     = 0x887060;
    const METAL     = 0x707070;
    const CRATE     = 0x8a7040;
    const BOMB_COL  = 0xffaa00;

    // ── FLOOR ───────────────────────────────────────────────
    // Main ground
    this._box(0, -0.5, 0, 500, 1, 500, SAND, false);

    // ── OUTER WALLS ─────────────────────────────────────────
    const mapW = 240, mapD = 240;
    // North
    this._box(0,  5, -mapD, mapW * 2, 10, 4, WALL);
    // South
    this._box(0,  5,  mapD, mapW * 2, 10, 4, WALL);
    // West
    this._box(-mapW, 5, 0, 4, 10, mapD * 2, WALL);
    // East
    this._box( mapW, 5, 0, 4, 10, mapD * 2, WALL);

    // ═══════════════════════════════════════════════════════
    //  T SPAWN (south-west)
    // ═══════════════════════════════════════════════════════
    // Spawn room back walls
    this._box(-110, 3, 210, 80, 6, 4, WALL);
    this._box(-150, 3, 185, 4, 6, 55, WALL);
    this._box(-70, 3, 185, 4, 6, 55, WALL);

    // ═══════════════════════════════════════════════════════
    //  CT SPAWN (north-east)
    // ═══════════════════════════════════════════════════════
    this._box( 110, 3, -210, 80, 6, 4, WALL);
    this._box( 150, 3, -185, 4, 6, 55, WALL);
    this._box(  70, 3, -185, 4, 6, 55, WALL);

    // ═══════════════════════════════════════════════════════
    //  LONG A (right side corridor)
    // ═══════════════════════════════════════════════════════
    // Top wall (north)
    this._box(50, 3, -100, 260, 6, 4, WALL);
    // Bottom wall (south), partial
    this._box(50, 3, -60, 120, 6, 4, WALL2);
    // Left wall
    this._box(-80, 3, -80, 4, 6, 44, WALL);
    // Long corner box
    this._box(155, 3, -80, 6, 6, 44, WALL);

    // Pit / long doors area
    // Doors
    this._box(20, 3, -100, 4, 6, 30, WALL2);
    this._box(60, 3, -100, 4, 6, 30, WALL2);

    // ═══════════════════════════════════════════════════════
    //  SITE A
    // ═══════════════════════════════════════════════════════
    // A site platform
    this._box(130, 0.5, -150, 70, 1, 70, SAND_DARK, false);
    // A site walls
    this._box(95, 3, -150, 4, 6, 70, WALL);   // left
    this._box(130, 3, -185, 70, 6, 4, WALL);  // top
    // Short/goose box (big cover)
    this._box(145, 4, -125, 22, 8, 16, CRATE);
    // Long box
    this._box(112, 2, -145, 14, 4, 24, CRATE);

    // Bomb site A marker
    this._box(130, 0.1, -150, 20, 0.2, 20, BOMB_COL, false);

    // ═══════════════════════════════════════════════════════
    //  MID (center area)
    // ═══════════════════════════════════════════════════════
    // Mid top wall
    this._box(0, 3, -100, 4, 6, 40, WALL);
    // Mid bottom wall
    this._box(0, 3, 0, 4, 6, 60, WALL);
    // Catwalk ledge
    this._box(-30, 2, -60, 30, 4, 4, WALL2);
    // Mid box
    this._box(-10, 2, -70, 16, 4, 14, CRATE);
    // Mid car / obstacle
    this._box(20, 2, -50, 18, 4, 10, METAL);

    // ═══════════════════════════════════════════════════════
    //  SHORT A (upper mid / catwalk)
    // ═══════════════════════════════════════════════════════
    // Catwalk wall
    this._box(-60, 3, -110, 4, 6, 60, WALL);
    this._box(-90, 3, -80, 60, 6, 4, WALL);
    // Catwalk floor (elevated)
    this._box(-60, 1.5, -90, 56, 3, 30, SAND_DARK, false);
    // CT connector
    this._box(-80, 3, -160, 4, 6, 80, WALL);
    this._box(-50, 3, -200, 60, 6, 4, WALL);

    // ═══════════════════════════════════════════════════════
    //  B TUNNEL (left side)
    // ═══════════════════════════════════════════════════════
    // Upper tunnel
    this._box(-130, 3, 0, 4, 6, 140, WALL);
    this._box(-180, 3, 0, 4, 6, 140, WALL);
    // Tunnel ceiling
    this._box(-155, 8, 0, 54, 2, 140, ROOF, false);
    // Tunnel cross-walls (archways hint)
    this._box(-155, 3, -50, 54, 6, 4, ROOF);
    this._box(-155, 3,  50, 54, 6, 4, ROOF);

    // B doors
    this._box(-130, 3, -65, 30, 6, 4, WALL2);
    this._box(-130, 3,  65, 30, 6, 4, WALL2);

    // ═══════════════════════════════════════════════════════
    //  SITE B
    // ═══════════════════════════════════════════════════════
    // B site platform
    this._box(-155, 0.5, -150, 60, 1, 60, SAND_DARK, false);
    // B site walls
    this._box(-185, 3, -150, 4, 6, 60, WALL); // left
    this._box(-155, 3, -182, 60, 6, 4, WALL); // top
    this._box(-125, 3, -150, 4, 6, 60, WALL); // right
    // Big box on B
    this._box(-150, 4, -155, 24, 8, 20, CRATE);
    // Small crate B
    this._box(-168, 3, -138, 12, 6, 12, CRATE);

    // Bomb site B marker
    this._box(-155, 0.1, -150, 20, 0.2, 20, BOMB_COL, false);

    // ═══════════════════════════════════════════════════════
    //  CONNECTING CORRIDORS
    // ═══════════════════════════════════════════════════════
    // Upper-mid connection
    this._box(-30, 3, -130, 60, 6, 4, WALL);
    this._box(-30, 3, -190, 60, 6, 4, WALL);
    this._box(-60, 3, -160, 4, 6, 60, WALL);

    // Mid-to-lower-B connector
    this._box(-80, 3, 80, 100, 6, 4, WALL2);
    this._box(-80, 3, 130, 100, 6, 4, WALL2);
    this._box(-30, 3, 105, 4, 6, 50, WALL);

    // T-side mid entry
    this._box(-80, 3, 160, 4, 6, 80, WALL);
    this._box(-130, 3, 160, 4, 6, 80, WALL);

    // ═══════════════════════════════════════════════════════
    //  SCATTERED CRATES (cover)
    // ═══════════════════════════════════════════════════════
    const cratePositions = [
      [40, 2, -130, 14, 4, 14],
      [80, 2, -80, 12, 4, 12],
      [-10, 2, -130, 12, 4, 12],
      [20, 2, 60, 14, 4, 14],
      [-50, 2, 100, 12, 4, 12],
      [100, 2, -180, 12, 4, 12],
      [-100, 2, -190, 14, 4, 14],
    ];
    cratePositions.forEach(([x, y, z, w, h, d]) => this._box(x, y, z, w, h, d, CRATE));

    // ═══════════════════════════════════════════════════════
    //  DECORATIVE ARCHES / BUILDINGS
    // ═══════════════════════════════════════════════════════
    // Building near A
    this._box(160, 5, -170, 30, 10, 4, WALL);
    this._box(160, 5, -200, 30, 10, 4, WALL);
    this._box(160, 10, -185, 30, 2, 30, ROOF);
    // Building near B
    this._box(-160, 5, -180, 4, 10, 30, WALL2);
    this._box(-190, 5, -170, 4, 10, 30, WALL2);
    this._box(-175, 10, -170, 30, 2, 30, ROOF);

    // ─ Lighting ─────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xfff4e0, 0.7);
    S.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff4d0, 1.2);
    sun.position.set(80, 200, 60);
    sun.castShadow = true;
    S.add(sun);

    const fill = new THREE.DirectionalLight(0xd0e8ff, 0.3);
    fill.position.set(-80, 100, -60);
    S.add(fill);

    // Sky
    S.background = new THREE.Color(0x7ec8e3);
    S.fog = new THREE.Fog(0xc8d8e8, 80, 350);
  },

  // Check collision for a moving AABB
  checkCollision(x, y, z, radius = 0.4, height = 1.7) {
    for (const c of this.colliders) {
      if (
        x + radius > c.minX && x - radius < c.maxX &&
        y + height > c.minY && y           < c.maxY &&
        z + radius > c.minZ && z - radius < c.maxZ
      ) return true;
    }
    return false;
  },

  // Bomb sites
  SITES: {
    A: { x: 130, z: -150, radius: 18 },
    B: { x: -155, z: -150, radius: 18 },
  },

  nearBombSite(x, z) {
    for (const [site, pos] of Object.entries(this.SITES)) {
      const dx = x - pos.x, dz = z - pos.z;
      if (Math.sqrt(dx * dx + dz * dz) < pos.radius) return site;
    }
    return null;
  }
};
