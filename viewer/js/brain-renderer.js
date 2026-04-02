/**
 * Brain Renderer — Three.js based 3D brain visualization.
 *
 * Renders the fsaverage brain mesh with ROI coloring, electrode spheres,
 * and interactive controls (orbit, zoom, clipping plane, view presets).
 */
class BrainRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // Brain mesh objects
        this.brainMeshGroup = new THREE.Group();
        this.brainMeshes = { lh: null, rh: null };

        // Electrode objects
        this.electrodeGroup = new THREE.Group();
        this.electrodeMeshes = [];   // Array of { mesh, electrode, visible }
        this.electrodeMap = {};       // name -> index in electrodeMeshes

        // Selection
        this.selectedElectrode = null;
        this.highlightMesh = null;

        // Clipping
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 100);
        this.clippingEnabled = false;

        // Raycaster for picking
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Settings (defaults — keep in sync with index.html)
        this.settings = {
            brainOpacity: 0.2,
            brainColor: new THREE.Color(0xe8e8e8),
            showROISurface: false,
            electrodeRadius: 1.25,
            electrodeOpacity: 0.9,
            highlightRadius: 5.0,
            bgColor: new THREE.Color(0x1a1a2e),
            ambientIntensity: 0.6,
        };

        // Callback
        this.onElectrodeClick = null;

        this._init();
    }

    // =========================================================================
    // Initialization
    // =========================================================================
    _init() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = this.settings.bgColor;

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        this.camera.position.set(200, 50, 200);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
        });
        this.renderer.setSize(w, h, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.localClippingEnabled = true;
        // Enable proper transparency sorting
        this.renderer.sortObjects = true;

        // Controls — TrackballControls for screen-space rotation
        this.controls = new THREE.TrackballControls(this.camera, this.canvas);
        this.controls.rotateSpeed = 3.0;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.8;
        this.controls.staticMoving = false;
        this.controls.dynamicDampingFactor = 0.15;
        this.controls.target.set(0, 0, 0);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, this.settings.ambientIntensity);
        ambient.name = 'ambient';
        this.scene.add(ambient);

        const directional1 = new THREE.DirectionalLight(0xffffff, 0.5);
        directional1.position.set(100, 100, 100);
        this.scene.add(directional1);

        const directional2 = new THREE.DirectionalLight(0xffffff, 0.3);
        directional2.position.set(-100, -50, -100);
        this.scene.add(directional2);

        // Add groups to scene
        this.scene.add(this.brainMeshGroup);
        this.scene.add(this.electrodeGroup);

        // Event listeners
        window.addEventListener('resize', () => this._onResize());
        this.canvas.addEventListener('click', (e) => this._onClick(e));

        // Start render loop
        this._animate();
    }

    // =========================================================================
    // Brain mesh
    // =========================================================================

    /**
     * Build and add the brain mesh from loaded data.
     * @param {object} meshData - { lh: {vertices, faces, vertex_colors}, rh: ... }
     * @param {object} atlasData - ROI atlas data (unused now — colors are embedded in mesh)
     */
    buildBrainMesh(meshData, atlasData) {
        // Remove old meshes
        this.brainMeshGroup.clear();

        for (const hemi of ['lh', 'rh']) {
            const data = meshData[hemi];
            const vertices = data.vertices;
            const faces = data.faces;
            const vertexColors = data.vertex_colors;  // [R,G,B] per vertex, 0-255

            // Build geometry
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(vertices.length * 3);
            const colors = new Float32Array(vertices.length * 3);

            for (let i = 0; i < vertices.length; i++) {
                positions[i * 3] = vertices[i][0];
                positions[i * 3 + 1] = vertices[i][1];
                positions[i * 3 + 2] = vertices[i][2];

                if (this.settings.showROISurface && vertexColors && vertexColors[i]) {
                    colors[i * 3] = vertexColors[i][0] / 255;
                    colors[i * 3 + 1] = vertexColors[i][1] / 255;
                    colors[i * 3 + 2] = vertexColors[i][2] / 255;
                } else {
                    colors[i * 3] = this.settings.brainColor.r;
                    colors[i * 3 + 1] = this.settings.brainColor.g;
                    colors[i * 3 + 2] = this.settings.brainColor.b;
                }
            }

            const indices = new Uint32Array(faces.length * 3);
            for (let i = 0; i < faces.length; i++) {
                indices[i * 3] = faces[i][0];
                indices[i * 3 + 1] = faces[i][1];
                indices[i * 3 + 2] = faces[i][2];
            }

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry.setIndex(new THREE.BufferAttribute(indices, 1));
            geometry.computeVertexNormals();

            // Material
            const material = new THREE.MeshPhongMaterial({
                vertexColors: true,
                transparent: true,
                opacity: this.settings.brainOpacity,
                side: THREE.DoubleSide,
                depthWrite: false,
                shininess: 30,
                clippingPlanes: this.clippingEnabled ? [this.clippingPlane] : [],
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 0;  // Render brain first (behind electrodes)
            this.brainMeshes[hemi] = mesh;
            this.brainMeshGroup.add(mesh);
        }

        // Center camera on brain
        this._centerCamera();
    }

    // =========================================================================
    // Electrodes
    // =========================================================================

    /**
     * Build electrode spheres from electrode data.
     * @param {Array} electrodes - Array of electrode objects
     * @param {DataManager} dataManager - For getting ROI colors
     */
    buildElectrodes(electrodes, dataManager) {
        // Clear existing
        this.electrodeGroup.clear();
        this.electrodeMeshes = [];
        this.electrodeMap = {};

        // Shared geometry (instanced spheres)
        const sphereGeom = new THREE.SphereGeometry(1, 16, 12);

        for (let i = 0; i < electrodes.length; i++) {
            const e = electrodes[i];
            if (e.x_fs == null || e.y_fs == null || e.z_fs == null) continue;

            const isSpecial = dataManager.isSpecialROI(e.roi);
            const color = dataManager.getElectrodeColor(e);
            const opacity = isSpecial ? 0.3 : this.settings.electrodeOpacity;
            const radius = this.settings.electrodeRadius;

            const material = new THREE.MeshPhongMaterial({
                color: color,
                transparent: true,
                opacity: opacity,
                shininess: 60,
                clippingPlanes: this.clippingEnabled ? [this.clippingPlane] : [],
            });

            const mesh = new THREE.Mesh(sphereGeom, material);
            mesh.position.set(e.x_fs, e.y_fs, e.z_fs);
            mesh.scale.setScalar(radius);
            mesh.renderOrder = 1;  // Render after brain

            // Store electrode reference on mesh for raycasting
            mesh.userData = { electrodeIndex: i, electrodeName: e.name };

            this.electrodeGroup.add(mesh);
            const entry = { mesh, electrode: e, visible: true };
            this.electrodeMeshes.push(entry);
            this.electrodeMap[e.name] = this.electrodeMeshes.length - 1;
        }
    }

    /**
     * Project all electrodes to the nearest vertex on the brain surface mesh.
     * Stores original positions for later restoration.
     * Uses the brain mesh vertices (already in the scene) as the surface.
     */
    projectElectrodesToSurface() {
        // Only save original positions once (don't overwrite if already projected)
        if (!this._savedElectrodePositions) {
            this._savedElectrodePositions = {};
            for (const entry of this.electrodeMeshes) {
                this._savedElectrodePositions[entry.electrode.name] = entry.mesh.position.clone();
            }
        }

        // Collect brain vertices per hemisphere
        const hemiVertices = {};
        const hemiNormals = {};
        for (const hemi of ['lh', 'rh']) {
            if (!this.brainMeshes[hemi]) continue;
            const posAttr = this.brainMeshes[hemi].geometry.getAttribute('position');
            const normalAttr = this.brainMeshes[hemi].geometry.getAttribute('normal');
            const verts = [];
            const normals = [];
            for (let i = 0; i < posAttr.count; i++) {
                verts.push([posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)]);
                if (normalAttr) {
                    normals.push([normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i)]);
                }
            }
            hemiVertices[hemi] = verts;
            hemiNormals[hemi] = normals;
        }

        const OFFSET_MM = 2.0;  // offset along surface normal to prevent embedding

        for (const entry of this.electrodeMeshes) {
            // Use original position for projection (not the already-projected position)
            const origPos = this._savedElectrodePositions[entry.electrode.name];
            if (!origPos) continue;

            // Determine hemisphere by x coordinate (x < 0 = lh, x >= 0 = rh)
            const hemi = origPos.x < 0 ? 'lh' : 'rh';
            const verts = hemiVertices[hemi];
            const normals = hemiNormals[hemi];
            if (!verts || verts.length === 0) continue;

            // Find nearest vertex (brute-force, fast enough for ~50k verts)
            let minDist = Infinity;
            let nearestIdx = 0;
            for (let i = 0; i < verts.length; i++) {
                const dx = origPos.x - verts[i][0];
                const dy = origPos.y - verts[i][1];
                const dz = origPos.z - verts[i][2];
                const dist = dx * dx + dy * dy + dz * dz;
                if (dist < minDist) {
                    minDist = dist;
                    nearestIdx = i;
                }
            }

            // Project to surface + offset along normal
            const sv = verts[nearestIdx];
            let nx = 0, ny = 0, nz = 0;
            if (normals.length > nearestIdx) {
                nx = normals[nearestIdx][0];
                ny = normals[nearestIdx][1];
                nz = normals[nearestIdx][2];
            }
            entry.mesh.position.set(
                sv[0] + nx * OFFSET_MM,
                sv[1] + ny * OFFSET_MM,
                sv[2] + nz * OFFSET_MM
            );
        }
    }

    /**
     * Restore electrode positions from saved state after surface projection.
     */
    restoreElectrodePositions() {
        if (!this._savedElectrodePositions) return;
        for (const entry of this.electrodeMeshes) {
            const saved = this._savedElectrodePositions[entry.electrode.name];
            if (saved) {
                entry.mesh.position.copy(saved);
            }
        }
        this._savedElectrodePositions = null;
    }

    /**
     * Update electrode visibility based on filter criteria.
     * @param {Set} visibleNames - Set of electrode names that should be visible
     */
    updateElectrodeVisibility(visibleNames) {
        for (const entry of this.electrodeMeshes) {
            const shouldShow = visibleNames.has(entry.electrode.name);
            entry.mesh.visible = shouldShow;
            entry.visible = shouldShow;
        }
    }

    /**
     * Update electrode colors. Mode: 'roi' or 'hga'.
     * For 'hga' mode, hgaValues should be { name: value } map.
     * @param {string} mode - 'roi' or 'hga'
     * @param {DataManager} dataManager
     * @param {object} hgaValues - { name: value }
     * @param {string} cmapName - colormap name
     * @param {number|null} vmin - explicit min (null = auto)
     * @param {number|null} vmax - explicit max (null = auto)
     */
    updateElectrodeColors(mode, dataManager, hgaValues = null, cmapName = 'RdBu_r', vmin = null, vmax = null) {
        if (mode === 'roi') {
            for (const entry of this.electrodeMeshes) {
                const color = dataManager.getElectrodeColor(entry.electrode);
                const isSpecial = dataManager.isSpecialROI(entry.electrode.roi);
                entry.mesh.material.color = color;
                entry.mesh.material.opacity = isSpecial ? 0.3 : this.settings.electrodeOpacity;
            }
        } else if (mode === 'hga' && hgaValues) {
            // Collect non-null values
            const vals = Object.values(hgaValues).filter(v => v !== null && !isNaN(v));
            if (vals.length === 0) return;

            // Use provided bounds or fallback to symmetric auto
            if (vmin === null || vmax === null) {
                const maxAbs = Math.max(Math.abs(Math.min(...vals)), Math.abs(Math.max(...vals)));
                if (vmin === null) vmin = -maxAbs;
                if (vmax === null) vmax = maxAbs;
            }

            for (const entry of this.electrodeMeshes) {
                const val = hgaValues[entry.electrode.name];
                if (val !== undefined && val !== null && !isNaN(val)) {
                    const color = this._valueToColor(val, vmin, vmax, cmapName);
                    entry.mesh.material.color = color;
                    entry.mesh.material.opacity = this.settings.electrodeOpacity;
                } else {
                    entry.mesh.material.color = new THREE.Color(0.5, 0.5, 0.5);
                    entry.mesh.material.opacity = 0.3;
                }
            }
        }
    }

    /**
     * Highlight a specific electrode (selected state).
     */
    highlightElectrode(name) {
        // Remove previous highlight
        this.clearHighlight();

        const idx = this.electrodeMap[name];
        if (idx === undefined) return;

        const entry = this.electrodeMeshes[idx];
        const pos = entry.mesh.position;

        // Create highlight ring/sphere
        const geom = new THREE.SphereGeometry(1, 24, 16);
        const mat = new THREE.MeshPhongMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.6,
            wireframe: true,
        });
        this.highlightMesh = new THREE.Mesh(geom, mat);
        this.highlightMesh.position.copy(pos);
        this.highlightMesh.scale.setScalar(this.settings.highlightRadius);
        this.highlightMesh.renderOrder = 2;
        this.scene.add(this.highlightMesh);

        this.selectedElectrode = name;
    }

    clearHighlight() {
        if (this.highlightMesh) {
            this.scene.remove(this.highlightMesh);
            this.highlightMesh.geometry.dispose();
            this.highlightMesh.material.dispose();
            this.highlightMesh = null;
        }
        this.selectedElectrode = null;
    }

    // =========================================================================
    // Electrode size / opacity updates
    // =========================================================================

    updateElectrodeRadius(radius) {
        this.settings.electrodeRadius = radius;
        for (const entry of this.electrodeMeshes) {
            entry.mesh.scale.setScalar(radius);
        }
    }

    updateElectrodeOpacity(opacity) {
        this.settings.electrodeOpacity = opacity;
        for (const entry of this.electrodeMeshes) {
            if (!entry.electrode || !this._isSpecialROI(entry.electrode.roi)) {
                entry.mesh.material.opacity = opacity;
            }
        }
    }

    _isSpecialROI(roi) {
        return ['Unknown', 'White-Matter', 'Intersection'].includes(roi);
    }

    // =========================================================================
    // Brain appearance
    // =========================================================================

    updateBrainOpacity(opacity) {
        this.settings.brainOpacity = opacity;
        for (const hemi of ['lh', 'rh']) {
            if (this.brainMeshes[hemi]) {
                this.brainMeshes[hemi].material.opacity = opacity;
            }
        }
    }

    updateBrainColor(color) {
        this.settings.brainColor = color;
        // Only applies when ROI surface is off
        if (!this.settings.showROISurface) {
            for (const hemi of ['lh', 'rh']) {
                if (this.brainMeshes[hemi]) {
                    const geom = this.brainMeshes[hemi].geometry;
                    const colors = geom.getAttribute('color');
                    for (let i = 0; i < colors.count; i++) {
                        colors.setXYZ(i, color.r, color.g, color.b);
                    }
                    colors.needsUpdate = true;
                }
            }
        }
    }

    updateBackground(color) {
        this.settings.bgColor = color;
        this.scene.background = color;
    }

    updateAmbientLight(intensity) {
        this.settings.ambientIntensity = intensity;
        const ambient = this.scene.getObjectByName('ambient');
        if (ambient) ambient.intensity = intensity;
    }

    // =========================================================================
    // Clipping plane
    // =========================================================================

    updateClipping(value, axis) {
        // value: 0-100 slider value
        // axis: 'x', 'y', or 'z'
        
        if (value >= 100) {
            // Disable clipping
            this.clippingEnabled = false;
            this._updateClippingPlanes([]);
            return;
        }

        this.clippingEnabled = true;

        // Compute clipping position from slider value
        // Map 0-100 to the brain mesh bounding box
        const bbox = new THREE.Box3().setFromObject(this.brainMeshGroup);
        const normal = new THREE.Vector3();
        let pos;

        if (axis === 'x') {
            normal.set(-1, 0, 0);
            pos = bbox.min.x + (value / 100) * (bbox.max.x - bbox.min.x);
        } else if (axis === 'y') {
            normal.set(0, -1, 0);
            pos = bbox.min.y + (value / 100) * (bbox.max.y - bbox.min.y);
        } else {
            normal.set(0, 0, -1);
            pos = bbox.min.z + (value / 100) * (bbox.max.z - bbox.min.z);
        }

        this.clippingPlane.normal.copy(normal);
        this.clippingPlane.constant = pos;

        this._updateClippingPlanes([this.clippingPlane]);
    }

    _updateClippingPlanes(planes) {
        for (const hemi of ['lh', 'rh']) {
            if (this.brainMeshes[hemi]) {
                this.brainMeshes[hemi].material.clippingPlanes = planes;
            }
        }
        for (const entry of this.electrodeMeshes) {
            entry.mesh.material.clippingPlanes = planes;
        }
    }

    // =========================================================================
    // Camera presets
    // =========================================================================

    setView(view) {
        const distance = 250;
        const target = new THREE.Vector3(0, 0, 0);

        const positions = {
            left:      new THREE.Vector3(-distance, 0, 0),
            right:     new THREE.Vector3(distance, 0, 0),
            anterior:  new THREE.Vector3(0, distance, 0),
            posterior:  new THREE.Vector3(0, -distance, 0),
            superior:  new THREE.Vector3(0, 0, distance),
            inferior:  new THREE.Vector3(0, 0, -distance),
        };

        let pos, up;
        if (view === 'reset') {
            pos = new THREE.Vector3(200, 50, 200);
            up  = new THREE.Vector3(0, 0, 1);
        } else {
            pos = positions[view];
            if (!pos) return;
            up = (view === 'superior' || view === 'inferior')
                ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(0, 0, 1);
        }

        // Set camera state
        this.camera.position.copy(pos);
        this.camera.up.copy(up);
        this.controls.target.copy(target);

        // Reset TrackballControls internal state so it doesn't fight the new pose
        this.controls.position0.copy(pos);
        this.controls.up0.copy(up);
        this.controls.target0.copy(target);
        this.controls.reset();
    }

    // =========================================================================
    // Raycasting / picking
    // =========================================================================

    _onClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Only intersect visible electrode meshes
        const visibleMeshes = this.electrodeMeshes
            .filter(e => e.visible)
            .map(e => e.mesh);

        const intersects = this.raycaster.intersectObjects(visibleMeshes);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const name = hit.userData.electrodeName;
            if (name && this.onElectrodeClick) {
                this.onElectrodeClick(name);
            }
        } else {
            // Click on empty space -> deselect
            if (this.onElectrodeClick) {
                this.onElectrodeClick(null);
            }
        }
    }

    // =========================================================================
    // Color mapping utilities
    // =========================================================================

    _valueToColor(value, vmin, vmax, cmapName) {
        // Normalize to 0-1
        let t = (vmax !== vmin) ? (value - vmin) / (vmax - vmin) : 0.5;
        t = Math.max(0, Math.min(1, t));

        const stops = BrainRenderer.COLORMAPS[cmapName] || BrainRenderer.COLORMAPS['RdBu_r'];
        return BrainRenderer._sampleColormap(stops, t);
    }

    /**
     * Sample a colormap defined as an array of [position, R, G, B] stops.
     * R, G, B are 0-255.
     */
    static _sampleColormap(stops, t) {
        // Clamp
        if (t <= stops[0][0]) return new THREE.Color(stops[0][1]/255, stops[0][2]/255, stops[0][3]/255);
        const last = stops[stops.length - 1];
        if (t >= last[0]) return new THREE.Color(last[1]/255, last[2]/255, last[3]/255);

        // Find segment
        for (let i = 0; i < stops.length - 1; i++) {
            if (t >= stops[i][0] && t <= stops[i+1][0]) {
                const frac = (t - stops[i][0]) / (stops[i+1][0] - stops[i][0]);
                const r = (stops[i][1] + frac * (stops[i+1][1] - stops[i][1])) / 255;
                const g = (stops[i][2] + frac * (stops[i+1][2] - stops[i][2])) / 255;
                const b = (stops[i][3] + frac * (stops[i+1][3] - stops[i][3])) / 255;
                return new THREE.Color(r, g, b);
            }
        }
        return new THREE.Color(last[1]/255, last[2]/255, last[3]/255);
    }

    // =========================================================================
    // Internal
    // =========================================================================

    _centerCamera() {
        const box = new THREE.Box3().setFromObject(this.brainMeshGroup);
        const center = box.getCenter(new THREE.Vector3());
        this.controls.target.copy(center);
        this.controls.update();
    }

    _onResize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (w === 0 || h === 0) return;

        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
        this.controls.handleResize();
    }

    _animate() {
        requestAnimationFrame(() => this._animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

// Colormap definitions: [position (0–1), R, G, B] stops
BrainRenderer.COLORMAPS = {
    // ---- Diverging (two-way) ----
    'RdBu_r': [
        [0.0,   5,  48,  97],
        [0.1,  33, 102, 172],
        [0.2,  67, 147, 195],
        [0.3, 146, 197, 222],
        [0.4, 209, 229, 240],
        [0.5, 247, 247, 247],
        [0.6, 253, 219, 199],
        [0.7, 244, 165, 130],
        [0.8, 214,  96,  77],
        [0.9, 178,  24,  43],
        [1.0, 103,   0,  31],
    ],
    'coolwarm': [
        [0.0,  59,  76, 192],
        [0.25, 141, 176, 254],
        [0.5, 221, 221, 221],
        [0.75, 245, 156, 125],
        [1.0, 180,   4,  38],
    ],
    'bwr': [
        [0.0,   0,   0, 255],
        [0.5, 255, 255, 255],
        [1.0, 255,   0,   0],
    ],
    'seismic': [
        [0.0,   0,   0,  77],
        [0.25,  0,   0, 255],
        [0.5, 255, 255, 255],
        [0.75,255,   0,   0],
        [1.0, 128,   0,   0],
    ],
    'PiYG': [
        [0.0, 142,   1,  82],
        [0.25,222, 119, 174],
        [0.5, 247, 247, 247],
        [0.75,127, 191, 123],
        [1.0,  39, 100,  25],
    ],
    'PRGn': [
        [0.0, 64,   0, 75],
        [0.25,153, 112, 171],
        [0.5, 247, 247, 247],
        [0.75,127, 191, 123],
        [1.0,   0,  68,  27],
    ],
    // ---- Sequential (one-way) ----
    'hot': [
        [0.0,  11,   0,   0],
        [0.35,255,   0,   0],
        [0.7, 255, 255,   0],
        [1.0, 255, 255, 255],
    ],
    'viridis': [
        [0.0,  68,   1,  84],
        [0.25, 59,  82, 139],
        [0.5,  33, 145, 140],
        [0.75, 94, 201,  98],
        [1.0, 253, 231,  37],
    ],
    'plasma': [
        [0.0,  13,   8, 135],
        [0.25,126,   3, 168],
        [0.5, 204,  71, 120],
        [0.75,248, 149,  64],
        [1.0, 240, 249,  33],
    ],
    'inferno': [
        [0.0,   0,   0,   4],
        [0.25, 87,  16, 110],
        [0.5, 188,  55,  84],
        [0.75,249, 142,   9],
        [1.0, 252, 255, 164],
    ],
    'YlOrRd': [
        [0.0, 255, 255, 178],
        [0.25,254, 204,  92],
        [0.5, 253, 141,  60],
        [0.75,240,  59,  32],
        [1.0, 128,   0,  38],
    ],
    'magma': [
        [0.0,   0,   0,   4],
        [0.25, 81,  18, 124],
        [0.5, 183,  55, 121],
        [0.75,254, 159, 109],
        [1.0, 252, 253, 191],
    ],
};

// Lists for UI population
BrainRenderer.DIVERGING_CMAPS = ['RdBu_r', 'coolwarm', 'bwr', 'seismic', 'PiYG', 'PRGn'];
BrainRenderer.SEQUENTIAL_CMAPS = ['hot', 'viridis', 'plasma', 'inferno', 'YlOrRd', 'magma'];
