import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GravitySimulator } from './physics.js';
import { GRID_EXTENT, GRID_RESOLUTION, setGridResolution } from './config.js';

// ---- GLOBALS & SETUP ----
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05050d);

// Fog for depth
scene.fog = new THREE.FogExp2(0x05050d, 0.005);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(20, 30, 40);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lights
const ambientLight = new THREE.AmbientLight(0x40404a); // Soft dark blue-ish
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffee, 1.2);
directionalLight.position.set(10, 20, 10);
scene.add(directionalLight);

// Simulator Instance
const sim = new GravitySimulator(scene, camera);

// Toggles State
const appState = {
    showGrid: true,
    showTrails: true,
    showVelocity: false,
    showForces: false,
    cameraTracking: false,
    trackedPlanetId: null
};

// ---- STARFIELD ----
function createStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1500;
    const posArray = new Float32Array(starCount * 3);
    const colorArray = new Float32Array(starCount * 3);
    const radius = 300;

    for (let i = 0; i < starCount * 3; i += 3) {
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = radius * (0.8 + 0.4 * Math.random());

        posArray[i] = r * Math.sin(phi) * Math.cos(theta);     // x
        posArray[i + 1] = r * Math.cos(phi);                   // y
        posArray[i + 2] = r * Math.sin(phi) * Math.sin(theta); // z

        const brightness = 0.5 + 0.5 * Math.random();
        colorArray[i] = brightness;
        colorArray[i + 1] = brightness;
        colorArray[i + 2] = brightness;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

    const starMat = new THREE.PointsMaterial({
        size: 1.5,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });

    const starMesh = new THREE.Points(starGeo, starMat);
    scene.add(starMesh);
}
createStarfield();

// ---- CURVED GRID ----
let gridMesh;
function createGrid() {
    if (gridMesh) scene.remove(gridMesh);

    // Update grid resolution without artificial caps to match Python behavior
    const res = GRID_RESOLUTION;
    const extent = GRID_EXTENT;

    const geo = new THREE.BufferGeometry();
    const numVerts = (res + 1) * (res + 1);
    const positions = new Float32Array(numVerts * 3);

    let idx = 0;
    for (let i = 0; i <= res; i++) {
        const x = -extent + (i / res) * (extent * 2);
        for (let j = 0; j <= res; j++) {
            const z = -extent + (j / res) * (extent * 2);
            positions[idx++] = x;
            positions[idx++] = 0;
            positions[idx++] = z;
        }
    }

    const indices = [];
    const width = res + 1;
    // Horizontal lines
    for (let i = 0; i <= res; i++) {
        for (let j = 0; j < res; j++) {
            const ind = i * width + j;
            indices.push(ind, ind + 1);
        }
    }
    // Vertical lines
    for (let i = 0; i < res; i++) {
        for (let j = 0; j <= res; j++) {
            const ind = i * width + j;
            indices.push(ind, ind + width);
        }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);

    const mat = new THREE.LineBasicMaterial({
        color: 0x3366cc,
        transparent: true,
        opacity: 0.4 // Slightly bolder since we dropped diagonals
    });

    gridMesh = new THREE.LineSegments(geo, mat);
    scene.add(gridMesh);
}
createGrid();

function updateGridCurvature() {
    if (!appState.showGrid) return;

    const positions = gridMesh.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        let yDisp = 0;

        for (const p of sim.planets) {
            const dx = x - p.position.x;
            const dz = z - p.position.z;
            const distSq = dx * dx + dz * dz;
            const softeningSq = 1.44; // 1.2^2
            const distEff = Math.sqrt(distSq + softeningSq);
            yDisp -= (p.mass / (distEff * 5.0)) * 0.15;
        }
        positions[i + 1] = yDisp;
    }
    gridMesh.geometry.attributes.position.needsUpdate = true;
}

// ---- FORCE FIELD ----
let forceFieldMesh;
function createForceField() {
    if (forceFieldMesh) scene.remove(forceFieldMesh);
    const spacing = 4;
    const extent = GRID_EXTENT - 2;
    const pointsCount = Math.pow(Math.floor((extent * 2) / spacing) + 1, 2);

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(pointsCount * 2 * 3); // 2 points per line
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.LineBasicMaterial({
        color: 0xff3333,
        transparent: true,
        opacity: 0.8
    });

    forceFieldMesh = new THREE.LineSegments(geo, mat);
    forceFieldMesh.visible = false;
    scene.add(forceFieldMesh);
}
createForceField();

function updateForceField() {
    if (!appState.showForces) return;

    const positions = forceFieldMesh.geometry.attributes.position.array;
    const spacing = 4;
    const extent = GRID_EXTENT - 2;
    let idx = 0;

    for (let x = -extent; x <= extent; x += spacing) {
        for (let z = -extent; z <= extent; z += spacing) {
            let fx = 0, fz = 0;
            let yDisp = 0;

            for (const p of sim.planets) {
                const dx = x - p.position.x;
                const dz = z - p.position.z;
                const distSq = dx * dx + dz * dz;
                const dist = Math.sqrt(distSq);

                if (dist > p.radius * 2) {
                    const distSafe = Math.max(1.0, dist);
                    const forceMag = (0.066743 * p.mass) / (distSafe * distSafe);
                    fx += forceMag * (-dx / distSafe);
                    fz += forceMag * (-dz / distSafe);
                }

                const softeningSq = 1.44;
                const distEff = Math.sqrt(distSq + softeningSq);
                yDisp -= (p.mass / (distEff * 5.0)) * 0.15;
            }

            const mag = Math.sqrt(fx * fx + fz * fz);
            if (mag > 0.01) {
                const scale = Math.min(1.5, mag * 2.0);
                const dirX = (fx / mag) * scale;
                const dirZ = (fz / mag) * scale;

                positions[idx++] = x;
                positions[idx++] = yDisp + 0.1;
                positions[idx++] = z;

                positions[idx++] = x + dirX;
                positions[idx++] = yDisp + 0.1;
                positions[idx++] = z + dirZ;
            } else {
                positions[idx++] = 0; positions[idx++] = 0; positions[idx++] = 0;
                positions[idx++] = 0; positions[idx++] = 0; positions[idx++] = 0;
            }
        }
    }
    forceFieldMesh.geometry.attributes.position.needsUpdate = true;
}

// ---- UI BINDINGS ----
const Elements = {
    // Status
    statusText: document.getElementById('status-text'),
    timeScaleText: document.getElementById('time-scale-text'),
    planetCountText: document.getElementById('planet-count-text'),

    // Editor
    editorEmpty: document.getElementById('editor-empty-state'),
    editorActive: document.getElementById('editor-active-state'),
    editorName: document.getElementById('editor-planet-name'),
    editorColor: document.getElementById('editor-planet-color'),
    inpMass: document.getElementById('inp-mass'),
    inpRadius: document.getElementById('inp-radius'),
    inpDensity: document.getElementById('inp-density'),
    inpSurfaceG: document.getElementById('inp-surface-g'),
    inpNetForce: document.getElementById('inp-net-force'),
    inpPosX: document.getElementById('inp-pos-x'),
    inpPosY: document.getElementById('inp-pos-y'),
    inpPosZ: document.getElementById('inp-pos-z'),
    inpVelX: document.getElementById('inp-vel-x'),
    inpVelY: document.getElementById('inp-vel-y'),
    inpVelZ: document.getElementById('inp-vel-z'),
    btnApply: document.getElementById('btn-apply'),
    btnDelete: document.getElementById('btn-delete'),

    // Toggles
    tglGrid: document.getElementById('toggle-grid'),
    tglTrails: document.getElementById('toggle-trails'),
    tglVelocity: document.getElementById('toggle-velocity'),
    tglForces: document.getElementById('toggle-forces'), // Unused visually in WebGL for now, but placeholder
    tglTracking: document.getElementById('toggle-tracking'),

    // Panels
    pnlLeftTarget: document.getElementById('left-panel-content'),
    pnlPresetsTarget: document.getElementById('presets-panel-content'),
    pnlRightTarget: document.getElementById('right-panel-content'),
    btnTglLeft: document.getElementById('toggle-left-panel'),
    btnTglPresets: document.getElementById('toggle-presets-panel'),
    btnTglRight: document.getElementById('toggle-right-panel'),
    btnResMinus: document.getElementById('btn-res-minus'),
    btnResPlus: document.getElementById('btn-res-plus'),
    gridResText: document.getElementById('grid-res-text'),
};

function togglePanel(btn, contentEl) {
    const isHidden = contentEl.classList.contains('hidden');
    if (isHidden) {
        contentEl.classList.remove('hidden');
        btn.textContent = '−';
    } else {
        contentEl.classList.add('hidden');
        btn.textContent = '+';
    }
}
Elements.btnTglLeft.addEventListener('click', () => togglePanel(Elements.btnTglLeft, Elements.pnlLeftTarget));
Elements.btnTglPresets.addEventListener('click', () => togglePanel(Elements.btnTglPresets, Elements.pnlPresetsTarget));
Elements.btnTglRight.addEventListener('click', () => togglePanel(Elements.btnTglRight, Elements.pnlRightTarget));


function updateUI() {
    // Global Status
    Elements.statusText.textContent = sim.paused ? 'PAUSED' : 'RUNNING';
    Elements.statusText.className = `value ${sim.paused ? 'paused' : 'running'}`;
    Elements.timeScaleText.textContent = `${sim.timeScale.toFixed(1)}x`;
    Elements.planetCountText.textContent = sim.planets.length;

    // Editor Update
    const planet = sim.getPlanetById(sim.selectedPlanetId);
    if (!planet) {
        Elements.editorEmpty.style.display = 'block';
        Elements.editorActive.style.display = 'none';
        Elements.editorName.textContent = 'No Selection';
        Elements.editorColor.style.backgroundColor = 'transparent';
    } else {
        Elements.editorEmpty.style.display = 'none';
        Elements.editorActive.style.display = 'block';

        Elements.editorName.textContent = planet.name;
        Elements.editorColor.style.backgroundColor = `#${planet.color.getHexString()}`;

        // Don't overwrite if user is actively typing in the inputs. 
        // For simplicity in this demo, we update fields continuously unless paused.
        // A robust UI would check document.activeElement.
        const activeMatches = (id) => document.activeElement === document.getElementById(id);

        if (!activeMatches('inp-mass')) Elements.inpMass.value = planet.mass.toFixed(2);
        if (!activeMatches('inp-radius')) Elements.inpRadius.value = planet.radius.toFixed(2);
        if (!activeMatches('inp-density')) Elements.inpDensity.value = planet.density().toFixed(2);

        Elements.inpSurfaceG.value = planet.surfaceGravity().toFixed(2);
        const f = planet.acceleration.length() * planet.mass;
        Elements.inpNetForce.value = f.toFixed(2);

        if (!activeMatches('inp-pos-x')) Elements.inpPosX.value = planet.position.x.toFixed(2);
        if (!activeMatches('inp-pos-y')) Elements.inpPosY.value = planet.position.y.toFixed(2);
        if (!activeMatches('inp-pos-z')) Elements.inpPosZ.value = planet.position.z.toFixed(2);

        if (!activeMatches('inp-vel-x')) Elements.inpVelX.value = planet.velocity.x.toFixed(2);
        if (!activeMatches('inp-vel-y')) Elements.inpVelY.value = planet.velocity.y.toFixed(2);
        if (!activeMatches('inp-vel-z')) Elements.inpVelZ.value = planet.velocity.z.toFixed(2);
    }
}

// Editor Apply Button
// Use pointerdown to fire before visual focus is lost, preventing updateUI from overwriting the typed value.
Elements.btnApply.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // prevent blur
    const p = sim.getPlanetById(sim.selectedPlanetId);
    if (!p) return;

    const parseNum = (val, fallback) => {
        const n = parseFloat(val);
        return isNaN(n) ? fallback : n;
    };

    p.mass = parseNum(Elements.inpMass.value, p.mass);
    p.radius = parseNum(Elements.inpRadius.value, p.radius);
    // (Ignoring density input manual override for simplicity in Apply).

    p.position.set(
        parseNum(Elements.inpPosX.value, p.position.x),
        parseNum(Elements.inpPosY.value, p.position.y),
        parseNum(Elements.inpPosZ.value, p.position.z)
    );
    p.velocity.set(
        parseNum(Elements.inpVelX.value, p.velocity.x),
        parseNum(Elements.inpVelY.value, p.velocity.y),
        parseNum(Elements.inpVelZ.value, p.velocity.z)
    );

    p.trail = []; // Reset trail
    updateUI();
});

// Editor Delete Button
Elements.btnDelete.addEventListener('click', () => {
    if (sim.selectedPlanetId) {
        sim.removePlanetById(sim.selectedPlanetId);
        updateUI();
    }
});

// Input inter-dependencies and real-time visual updates
Elements.inpMass.addEventListener('input', () => {
    const p = sim.getPlanetById(sim.selectedPlanetId);
    if (!p) return;
    const m = parseFloat(Elements.inpMass.value);
    if (!isNaN(m)) {
        p.mass = m;
        const vol = (4 / 3) * Math.PI * Math.pow(p.radius, 3);
        Elements.inpDensity.value = (m / vol).toFixed(2);
    }
});

Elements.inpRadius.addEventListener('input', () => {
    const p = sim.getPlanetById(sim.selectedPlanetId);
    if (!p) return;
    const r = parseFloat(Elements.inpRadius.value);
    if (!isNaN(r) && r > 0) {
        p.radius = r;
        const vol = (4 / 3) * Math.PI * Math.pow(r, 3);
        Elements.inpDensity.value = (p.mass / vol).toFixed(2);
    }
});

Elements.inpDensity.addEventListener('input', () => {
    const p = sim.getPlanetById(sim.selectedPlanetId);
    if (!p) return;
    const d = parseFloat(Elements.inpDensity.value);
    if (!isNaN(d) && d > 0) {
        const vol = (4 / 3) * Math.PI * Math.pow(p.radius, 3);
        p.mass = d * vol;
        Elements.inpMass.value = p.mass.toFixed(2);
    }
});

// Grid Resolution controls
Elements.btnResMinus.addEventListener('click', () => {
    const newRes = Math.max(10, GRID_RESOLUTION - 20);
    setGridResolution(newRes);
    Elements.gridResText.textContent = newRes;
    createGrid();
});

Elements.btnResPlus.addEventListener('click', () => {
    const newRes = Math.min(500, GRID_RESOLUTION + 20);
    setGridResolution(newRes);
    Elements.gridResText.textContent = newRes;
    createGrid();
});

// Callbacks
sim.onPlanetsMerged = (newPlanet, isSelected) => {
    if (isSelected) {
        // Transfer tracking seamlessly
        if (appState.trackedPlanetId !== null) {
            appState.trackedPlanetId = newPlanet.id;
        }
        updateUI();
    }
};

// ---- INTERACTION ----
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.domElement.addEventListener('pointerdown', (event) => {
    // Left click only
    if (event.button !== 0) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Get all planet meshes
    const meshes = sim.planets.map(p => p.mesh).filter(m => m);
    const intersects = raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
        const id = intersects[0].object.userData.planetId;
        sim.selectedPlanetId = id;
    } else {
        sim.selectedPlanetId = null;
    }
    updateUI();
});

// Keyboard Controls
window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return; // Ignore if typing

    switch (e.key.toLowerCase()) {
        case ' ':
            e.preventDefault();
            sim.paused = !sim.paused;
            updateUI();
            break;
        case 'r':
            loadPreset(1);
            break;
        case 'c':
            appState.cameraTracking = !appState.cameraTracking;
            if (appState.cameraTracking) {
                appState.trackedPlanetId = sim.selectedPlanetId;
            } else {
                appState.trackedPlanetId = null;
            }
            updateTogglesUI();
            break;
        case 'g':
            appState.showGrid = !appState.showGrid;
            gridMesh.visible = appState.showGrid;
            updateTogglesUI();
            break;
        case 't':
            appState.showTrails = !appState.showTrails;
            sim.planets.forEach(p => { if (p.trailLine) p.trailLine.visible = appState.showTrails; });
            updateTogglesUI();
            break;
        case 'v':
            appState.showVelocity = !appState.showVelocity;
            sim.planets.forEach(p => { if (p.velocityArrow) p.velocityArrow.visible = appState.showVelocity; });
            updateTogglesUI();
            break;
        case 'f':
            appState.showForces = !appState.showForces;
            if (forceFieldMesh) forceFieldMesh.visible = appState.showForces;
            updateTogglesUI();
            break;
        case '=':
        case '+':
            sim.timeScale += 0.5;
            updateUI();
            break;
        case '-':
        case '_':
            sim.timeScale = Math.max(0.1, sim.timeScale - 0.5);
            updateUI();
            break;
        case 'n':
            // Add random planet
            const angle = Math.random() * Math.PI * 2;
            const dist = 8 + Math.random() * 6;
            const pos = [dist * Math.cos(angle), (Math.random() - 0.5) * 4, dist * Math.sin(angle)];

            let v = 1;
            if (sim.planets.length > 0) v = 1.5;
            const vel = [-Math.sin(angle) * v, (Math.random() - 0.5) * 0.4, Math.cos(angle) * v];

            sim.createPlanet(pos, vel, 10 + Math.random() * 40, 0.4 + Math.random() * 0.5, null);
            updateUI();
            break;
        case '1': loadPreset(1); break;
        case '2': loadPreset(2); break;
        case '3': loadPreset(3); break;
        case '4': loadPreset(4); break;
        case '5': loadPreset(5); break;
        case '6': loadPreset(6); break;
    }
});

// Toggles Logic
function bindToggle(id, stateKey, onChange) {
    const el = document.getElementById(id);
    el.addEventListener('click', () => {
        appState[stateKey] = !appState[stateKey];
        if (onChange) onChange(appState[stateKey]);
        updateTogglesUI();
    });
}
bindToggle('toggle-grid', 'showGrid', (v) => { gridMesh.visible = v; });
bindToggle('toggle-trails', 'showTrails', (v) => {
    sim.planets.forEach(p => { if (p.trailLine) p.trailLine.visible = v; });
});
bindToggle('toggle-velocity', 'showVelocity', (v) => {
    sim.planets.forEach(p => { if (p.velocityArrow) p.velocityArrow.visible = v; });
});
bindToggle('toggle-forces', 'showForces', (v) => {
    if (forceFieldMesh) forceFieldMesh.visible = v;
});
bindToggle('toggle-tracking', 'cameraTracking', (v) => {
    if (v) appState.trackedPlanetId = sim.selectedPlanetId;
    else appState.trackedPlanetId = null;
});

function updateTogglesUI() {
    const tgl = (el, state) => {
        el.className = `toggle-option ${state ? 'active' : ''}`;
        el.innerHTML = `<span class="icon">${state ? '●' : '○'}</span> ${el.textContent.trim().replace(/^[●○]\s*/, '')}`;
    };
    tgl(Elements.tglGrid, appState.showGrid);
    tgl(Elements.tglTrails, appState.showTrails);
    tgl(Elements.tglVelocity, appState.showVelocity);
    tgl(Elements.tglForces, appState.showForces);
    tgl(Elements.tglTracking, appState.cameraTracking);
}

// Presets Buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const num = parseInt(e.target.getAttribute('data-preset'));
        loadPreset(num);
    });
});

function loadPreset(num) {
    sim.clearPlanets();
    appState.trackedPlanetId = null;

    if (num === 1) { // Solar System Approx
        sim.createPlanet([0, 0, 0], [0, 0, 0], 500, 1.5, [1, 0.9, 0.3], 'Sun');
        sim.createPlanet([5, 0, 0], [0, 0, 3.2], 5, 0.3, [0.7, 0.7, 0.7], 'Mercury');
        sim.createPlanet([7, 0, 2], [0, 0.3, 2.5], 12, 0.45, [0.9, 0.6, 0.3], 'Venus');
        sim.createPlanet([10, 0, 0], [0, 0.2, 2.2], 15, 0.5, [0.3, 0.5, 0.9], 'Earth');
        sim.createPlanet([14, 0, -2], [0, -0.1, 1.8], 8, 0.35, [0.9, 0.4, 0.2], 'Mars');
        sim.createPlanet([20, 0, 0], [0, 0.1, 1.3], 60, 0.8, [0.8, 0.7, 0.6], 'Jupiter');
    } else if (num === 2) { // Binary
        sim.createPlanet([-4, 0, 0], [0, 0, 1.2], 300, 1.2, [1.0, 0.6, 0.2], "Star A");
        sim.createPlanet([4, 0, 0], [0, 0, -1.2], 300, 1.2, [0.4, 0.7, 1.0], "Star B");
        sim.createPlanet([0, 0, 12], [1.5, 0, 0], 10, 0.4, [0.5, 0.9, 0.5], "Planet");
    } else if (num === 3) { // Trinary
        sim.createPlanet([-5, 0, 0], [0, 0.5, 0.8], 200, 1.0, [0.9, 0.3, 0.4], "Star 1");
        sim.createPlanet([5, 0, 0], [0, -0.3, -0.8], 200, 1.0, [0.3, 0.9, 0.5], "Star 2");
        sim.createPlanet([0, 0, 6], [-0.5, 0.2, 0], 200, 1.0, [0.4, 0.5, 1.0], "Star 3");
    } else if (num === 4) { // Figure 8
        const v = 0.8;
        sim.createPlanet([-3, 0, 0], [0, v * 0.5, v], 150, 0.9, [1.0, 0.5, 0.8], "Alpha");
        sim.createPlanet([3, 0, 0], [0, v * 0.5, v], 150, 0.9, [0.5, 1.0, 0.8], "Beta");
        sim.createPlanet([0, 0, 0], [0, -v, -2 * v], 150, 0.9, [0.8, 0.5, 1.0], "Gamma");
    } else if (num === 5) { // Collision
        for (let i = 0; i < 10; i++) {
            sim.createPlanet([-(5 + Math.random() * 5), (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 10], [1 + Math.random(), 0, 0], 5 + Math.random() * 15, 0.3 + Math.random() * 0.3, null);
        }
        for (let i = 0; i < 10; i++) {
            sim.createPlanet([(5 + Math.random() * 5), (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 10], [-1 - Math.random(), 0, 0], 5 + Math.random() * 15, 0.3 + Math.random() * 0.3, null);
        }
    } else if (num === 6) { // Random Cluster
        for (let i = 0; i < 30; i++) {
            sim.createPlanet([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 30], [(Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1], 5 + Math.random() * 20, 0.3, null);
        }
    }

    sim.planets.forEach(p => {
        p.trailLine.visible = appState.showTrails;
        p.velocityArrow.visible = appState.showVelocity;
    });

    updateUI();
}

// Init
loadPreset(1);

// ---- RENDER LOOP ----
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    let dt = clock.getDelta();
    // Cap dt to prevent massive jumps when tab is inactive
    if (dt > 0.1) dt = 0.1;

    // Simulation Step
    sim.update(dt);

    // Update Mesh positions, trails, highlights
    sim.updateVisuals(camera);

    // Update Grid Curvature 
    if (appState.showGrid) {
        updateGridCurvature();
    }

    // Update Force Field
    if (appState.showForces) {
        updateForceField();
    }

    // Camera Tracking
    if (appState.cameraTracking && appState.trackedPlanetId !== null) {
        const p = sim.getPlanetById(appState.trackedPlanetId);
        if (p) {
            const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
            controls.target.copy(p.position);
            camera.position.copy(p.position).add(offset);
        } else {
            // Planet was deleted or merged into something else (we could transfer track if we wanted)
            appState.cameraTracking = false;
            appState.trackedPlanetId = null;
            updateTogglesUI();
        }
    }

    controls.update();

    // UI dynamic update
    updateUI();

    renderer.render(scene, camera);
}

animate();
