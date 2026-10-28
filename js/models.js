import * as THREE from 'three';
import { G, TRAIL_LENGTH } from './config.js';

export class Planet {
    constructor(position, velocity, mass, radius, colorArray, name, id) {
        this.position = new THREE.Vector3(...position);
        this.velocity = new THREE.Vector3(...velocity);
        this.mass = mass;
        this.radius = radius;
        this.color = new THREE.Color(...colorArray);
        this.name = name;
        this.id = id;

        this.acceleration = new THREE.Vector3(0, 0, 0);
        this.trail = []; // Array of Vector3

        // Visuals
        this.mesh = null;
        this.trailLine = null;
        this.velocityArrow = null;
        this.selectionRing = null;
    }

    density() {
        const volume = (4 / 3) * Math.PI * Math.pow(this.radius, 3);
        return volume > 0 ? this.mass / volume : 0;
    }

    setDensity(density) {
        const volume = (4 / 3) * Math.PI * Math.pow(this.radius, 3);
        this.mass = density * volume;
    }

    surfaceGravity() {
        if (this.radius > 0) {
            return (G * this.mass) / (this.radius * this.radius);
        }
        return 0;
    }

    // Three.js specific initialization
    initVisuals(scene) {
        // Planet Sphere
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        // We use Phong for the shiny look with lighting
        const material = new THREE.MeshPhongMaterial({
            color: this.color,
            shininess: 30
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.scale.setScalar(this.radius);
        this.mesh.position.copy(this.position);
        this.mesh.userData = { planetId: this.id }; // For raycasting
        scene.add(this.mesh);

        // Trail Line (Support vertex colors for fading effect)
        const trailMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.8 // Base opacity, vertex color fades to background
        });
        const maxPoints = TRAIL_LENGTH;
        const trailGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(maxPoints * 3);
        const colors = new Float32Array(maxPoints * 3);
        trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        trailGeometry.setDrawRange(0, 0);

        this.trailLine = new THREE.Line(trailGeometry, trailMaterial);
        scene.add(this.trailLine);

        // Velocity Arrow (optional, updated per frame)
        this.velocityArrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 1, 0),
            this.position,
            1,
            0x33ff4c,
            0.5,
            0.3
        );
        this.velocityArrow.visible = false;
        scene.add(this.velocityArrow);

        // Selection Ring
        const ringGeo = new THREE.RingGeometry(1.2, 1.4, 64);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
        this.selectionRing.visible = false;
        // The ring will rotate to face the camera, this is handled in updateVisuals
        scene.add(this.selectionRing);
    }

    updateVisuals(camera) {
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            // Apply radius changes from UI
            this.mesh.scale.setScalar(this.radius);
            // Apply color changes if merged
            this.mesh.material.color.copy(this.color);
        }

        // Update trail
        if (this.trailLine) {
            this.trail.push(this.position.clone());
            if (this.trail.length > TRAIL_LENGTH) {
                this.trail.shift();
            }

            const positions = this.trailLine.geometry.attributes.position.array;
            const colors = this.trailLine.geometry.attributes.color.array;

            const bg = new THREE.Color(0x05050d); // Same as scene background

            for (let i = 0; i < this.trail.length; i++) {
                positions[i * 3] = this.trail[i].x;
                positions[i * 3 + 1] = this.trail[i].y;
                positions[i * 3 + 2] = this.trail[i].z;

                // Fade from background color to line color
                const ratio = i / this.trail.length;
                const c = bg.clone().lerp(this.color, ratio * 0.8 + 0.2);
                colors[i * 3] = c.r;
                colors[i * 3 + 1] = c.g;
                colors[i * 3 + 2] = c.b;
            }
            this.trailLine.geometry.setDrawRange(0, this.trail.length);
            this.trailLine.geometry.attributes.position.needsUpdate = true;
            this.trailLine.geometry.attributes.color.needsUpdate = true;
        }

        // Update velocity arrow
        if (this.velocityArrow && this.velocityArrow.visible) {
            const velMag = this.velocity.length();
            if (velMag > 0.01) {
                const dir = this.velocity.clone().normalize();
                this.velocityArrow.setDirection(dir);
                // Scale arrow length by velocity, map to reasonable bounds
                this.velocityArrow.setLength(velMag * 2, 0.5, 0.3);
                this.velocityArrow.position.copy(this.position);
            }
        }

        // Update selection ring
        if (this.selectionRing && this.selectionRing.visible && camera) {
            this.selectionRing.position.copy(this.position);
            this.selectionRing.scale.setScalar(this.radius);
            this.selectionRing.lookAt(camera.position);
        }
    }

    dispose(scene) {
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.trailLine) {
            scene.remove(this.trailLine);
            this.trailLine.geometry.dispose();
            this.trailLine.material.dispose();
        }
        if (this.velocityArrow) {
            scene.remove(this.velocityArrow);
        }
        if (this.selectionRing) {
            scene.remove(this.selectionRing);
            this.selectionRing.geometry.dispose();
            this.selectionRing.material.dispose();
        }
    }
}
