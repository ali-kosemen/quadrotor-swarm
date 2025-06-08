class DroneVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // Drone objects
        this.drones = new Map();
        this.droneTrails = new Map();
        this.goals = new Map();

        // Scene objects
        this.room = null;
        this.floor = null;
        this.lights = [];

        // Settings
        this.showTrails = true;
        this.showGoals = true;
        this.maxTrailLength = 25;  // Matching pyglet's viz_traces = 25
        this.roomDimensions = { x: 10, y: 10, z: 10 };  // Matching config: quads_room_dims [10.0, 10.0, 10.0]

        // Camera system - only global view
        this.currentCameraView = 'global';
        this.availableCameraViews = ['global'];
        this.cameraInitialized = false;



        this.cameraParams = {
            global: {
                radius: 12, // Start at medium distance for good overview
                theta: Math.PI / 3, // 60 degree angle from top
                phi: 0,   // Start from front (not corner)
                minRadius: 1,       // Minimum zoom distance (very close)
                maxRadius: 100      // Maximum zoom distance (very far)
            }
        };



        // Bright colors for different drones (more visible in night theme)
        this.droneColors = [
            0xFF3333, // Bright Red
            0x33FF33, // Bright Green
            0x3333FF, // Bright Blue
            0xFFFF33, // Bright Yellow
            0xFF33FF, // Bright Magenta
            0x33FFFF, // Bright Cyan
            0xFF9933, // Bright Orange
            0x9933FF  // Bright Purple
        ];

        this.init();
    }

    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupControls();
        this.setupLights();
        this.setupRoom();
        this.animate();

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupScene() {
        this.scene = new THREE.Scene();

        // Beautiful sky gradient background
        this.setupSkybox();

        // Atmospheric fog for depth with deep night theme
        this.scene.fog = new THREE.Fog(0x000011, 30, 150); // Very deep night fog

        // Add stars to the night sky
        this.addStars();
    }

    setupSkybox() {
        // Create a beautiful night sky with deep blue gradient
        const skyGeometry = new THREE.SphereGeometry(200, 32, 32);

        // Create deep night sky gradient material
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x000011) }, // Very deep night
                middleColor: { value: new THREE.Color(0x001122) }, // Dark night blue
                bottomColor: { value: new THREE.Color(0x002244) }, // Slightly lighter night
                offset: { value: 33 },
                exponent: { value: 0.8 },
                time: { value: 0.0 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 middleColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                uniform float time;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    vec3 color;

                    // Create a three-color gradient for natural sky
                    if (h > 0.3) {
                        // Sky to sunset transition
                        float factor = (h - 0.3) / 0.7;
                        color = mix(middleColor, topColor, factor);
                    } else {
                        // Ground to sunset transition
                        float factor = h / 0.3;
                        color = mix(bottomColor, middleColor, factor);
                    }

                    // Add subtle time-based variation
                    color += 0.05 * sin(time * 0.5) * vec3(1.0, 0.8, 0.6);

                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide
        });

        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);
        this.skyMaterial = skyMaterial; // Store reference for animation

        // Add stars for night sky atmosphere
        this.addStars();
    }

    addStars() {
        // Create starfield for night sky atmosphere
        const starsGeometry = new THREE.BufferGeometry();
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xFFFFFF,
            size: 2,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: false
        });

        const starsVertices = [];
        for (let i = 0; i < 1000; i++) {
            const x = (Math.random() - 0.5) * 400;
            const y = (Math.random() - 0.5) * 400;
            const z = (Math.random() - 0.5) * 400;
            starsVertices.push(x, y, z);
        }

        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
        const stars = new THREE.Points(starsGeometry, starsMaterial);
        this.scene.add(stars);
    }

    setupCamera() {
        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        // Start with global camera view, closer to the action
        this.setCameraView('global');
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            logarithmicDepthBuffer: true  // Better depth precision for close/far objects
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Improve line rendering
        this.renderer.sortObjects = false;  // Disable automatic sorting which can cause issues with lines
    }

    setupControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = this.cameraParams.global.maxRadius;
        this.controls.minDistance = this.cameraParams.global.minRadius;

        // Enable zoom for full freedom
        this.controls.enableZoom = true;
        this.controls.zoomSpeed = 1.0;

        // Enable rotation for 360 degree movement
        this.controls.enableRotate = true;
        this.controls.rotateSpeed = 1.0;

        // Enable panning
        this.controls.enablePan = true;
        this.controls.panSpeed = 1.0;

        // Set initial target to room center
        this.controls.target.set(0, 2.5, 0);
    }

    setupLights() {
        // Ambient light for night atmosphere - increased to see drones better
        const ambientLight = new THREE.AmbientLight(0x223344, 0.4); // Slightly brighter ambient
        this.scene.add(ambientLight);
        this.lights.push(ambientLight);

        // Main moonlight - increased intensity to see drones
        const moonLight = new THREE.DirectionalLight(0x8899CC, 0.6); // Brighter cool moonlight
        moonLight.position.set(30, 40, 20);
        moonLight.castShadow = true;
        moonLight.shadow.mapSize.width = 4096;
        moonLight.shadow.mapSize.height = 4096;
        moonLight.shadow.camera.near = 0.5;
        moonLight.shadow.camera.far = 200;
        moonLight.shadow.camera.left = -50;
        moonLight.shadow.camera.right = 50;
        moonLight.shadow.camera.top = 50;
        moonLight.shadow.camera.bottom = -50;
        moonLight.shadow.bias = -0.0001;
        this.scene.add(moonLight);
        this.lights.push(moonLight);

        // Fill light from opposite direction
        const fillLight = new THREE.DirectionalLight(0x445566, 0.3); // Brighter fill light
        fillLight.position.set(-20, 20, -20);
        this.scene.add(fillLight);
        this.lights.push(fillLight);

        // Hemisphere light for night sky
        const hemiLight = new THREE.HemisphereLight(0x001122, 0x223344, 0.3);
        hemiLight.position.set(0, 50, 0);
        this.scene.add(hemiLight);
        this.lights.push(hemiLight);
    }

    setupRoom() {
        const { x, y, z } = this.roomDimensions;

        // Room box: X: [-5, +5], Y: [-5, +5], Z: [0, +10]
        // Three.js: X: [-5, +5], Y: [0, +10], Z: [-5, +5] (Y and Z swapped)

        // Enhanced floor with beautiful design
        this.createEnhancedFloor(x, y);

        // Room walls (edges only, no wireframe) - just outline
        this.createRoomOutline(x, y, z);
    }

    createEnhancedFloor(x, y) {
        // Main floor with gradient material
        const floorGeometry = new THREE.PlaneGeometry(x, y);

        // Create a beautiful floor material with subtle pattern
        const floorMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                color1: { value: new THREE.Color(0x112233) }, // Dark blue
                color2: { value: new THREE.Color(0x223344) }, // Slightly lighter blue
                gridColor: { value: new THREE.Color(0x334455) }, // Grid color
                gridSize: { value: 20.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color1;
                uniform vec3 color2;
                uniform vec3 gridColor;
                uniform float gridSize;
                varying vec2 vUv;

                void main() {
                    vec2 grid = abs(fract(vUv * gridSize) - 0.5) / fwidth(vUv * gridSize);
                    float line = min(grid.x, grid.y);

                    // Create subtle gradient
                    float gradient = length(vUv - 0.5) * 0.5;
                    vec3 baseColor = mix(color1, color2, gradient);

                    // Add grid lines
                    vec3 finalColor = mix(gridColor, baseColor, smoothstep(0.0, 2.0, line));

                    // Add subtle glow effect
                    finalColor += 0.1 * sin(time * 0.5) * vec3(0.2, 0.4, 0.6);

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            transparent: false
        });

        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.position.set(0, 0, 0);
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);

        // Store material reference for animation
        this.floorMaterial = floorMaterial;
    }

    createRoomOutline(x, y, z) {
        // Create room outline with just the edges, no cross lines
        const outlineGroup = new THREE.Group();

        // Bottom edges (floor level)
        const bottomEdges = [
            [[-x/2, 0, -y/2], [x/2, 0, -y/2]],   // Front edge
            [[x/2, 0, -y/2], [x/2, 0, y/2]],     // Right edge
            [[x/2, 0, y/2], [-x/2, 0, y/2]],     // Back edge
            [[-x/2, 0, y/2], [-x/2, 0, -y/2]]    // Left edge
        ];

        // Top edges (ceiling level)
        const topEdges = [
            [[-x/2, z, -y/2], [x/2, z, -y/2]],   // Front edge
            [[x/2, z, -y/2], [x/2, z, y/2]],     // Right edge
            [[x/2, z, y/2], [-x/2, z, y/2]],     // Back edge
            [[-x/2, z, y/2], [-x/2, z, -y/2]]    // Left edge
        ];

        // Vertical edges (corners)
        const verticalEdges = [
            [[-x/2, 0, -y/2], [-x/2, z, -y/2]], // Front-left
            [[x/2, 0, -y/2], [x/2, z, -y/2]],   // Front-right
            [[x/2, 0, y/2], [x/2, z, y/2]],     // Back-right
            [[-x/2, 0, y/2], [-x/2, z, y/2]]    // Back-left
        ];

        const allEdges = [...bottomEdges, ...topEdges, ...verticalEdges];

        allEdges.forEach(edge => {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array([
                edge[0][0], edge[0][1], edge[0][2],
                edge[1][0], edge[1][1], edge[1][2]
            ]);
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            const material = new THREE.LineBasicMaterial({
                color: 0x445566,
                transparent: true,
                opacity: 0.4
            });

            const line = new THREE.Line(geometry, material);
            outlineGroup.add(line);
        });

        this.scene.add(outlineGroup);
        this.roomOutline = outlineGroup;
    }

    createDroneGeometry() {
        const group = new THREE.Group();

        // Pyglet dimensions: quad_arm_size = 0.05, motor_pos = 0.065/2 = 0.0325
        // Main body (cylinder) - bigger and more visible with emissive material
        const bodyGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.015, 8);
        const bodyMaterial = new THREE.MeshPhongMaterial({
            color: 0x666666,
            shininess: 100,
            specular: 0x888888,
            emissive: 0x222222,
            emissiveIntensity: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        group.add(body);

        // Center LED light - bigger and brighter
        const centerLedGeometry = new THREE.SphereGeometry(0.008, 8, 8);
        const centerLedMaterial = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            emissive: 0x00FF00,
            emissiveIntensity: 1.0
        });
        const centerLed = new THREE.Mesh(centerLedGeometry, centerLedMaterial);
        centerLed.position.set(0, 0.012, 0);
        group.add(centerLed);

        // Arms and propellers - matching pyglet dimensions
        const armLength = 0.065;  // Total arm span like pyglet
        const motorDistance = 0.0325;  // Distance from center to motor
        const armPositions = [
            [motorDistance, 0, 0], [-motorDistance, 0, 0],
            [0, 0, motorDistance], [0, 0, -motorDistance]
        ];

        armPositions.forEach((pos, index) => {
            // Arm - thicker and more visible with emissive material
            const armGeometry = new THREE.CylinderGeometry(0.004, 0.004, motorDistance, 6);
            const armMaterial = new THREE.MeshPhongMaterial({
                color: 0x777777,
                shininess: 80,
                emissive: 0x111111,
                emissiveIntensity: 0.2
            });
            const arm = new THREE.Mesh(armGeometry, armMaterial);

            if (index < 2) {
                arm.rotation.z = Math.PI / 2;
                arm.position.set(pos[0] / 2, 0, 0);
            } else {
                arm.rotation.x = Math.PI / 2;
                arm.position.set(0, 0, pos[2] / 2);
            }

            group.add(arm);

            // Motor housing - bigger and more visible
            const motorGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 8);
            const motorMaterial = new THREE.MeshPhongMaterial({
                color: 0x555555,
                shininess: 60,
                emissive: 0x111111,
                emissiveIntensity: 0.2
            });
            const motor = new THREE.Mesh(motorGeometry, motorMaterial);
            motor.position.set(pos[0], 0.008, pos[2]);
            motor.castShadow = true;
            group.add(motor);

            // Propeller - matching pyglet propeller radius (0.022) with transparency
            const propGeometry = new THREE.CylinderGeometry(0.022, 0.022, 0.002, 16);
            const propMaterial = new THREE.MeshPhongMaterial({
                color: 0x888888,
                transparent: true,
                opacity: 0.6,
                shininess: 100
            });
            const propeller = new THREE.Mesh(propGeometry, propMaterial);
            propeller.position.set(pos[0], 0.01, pos[2]);
            propeller.castShadow = true;
            group.add(propeller);

            // LED lights on each arm tip - bigger and brighter
            const ledGeometry = new THREE.SphereGeometry(0.006, 8, 8);
            const ledColors = [0xFF0000, 0x00FF00, 0x0000FF, 0xFFFF00]; // Red, Green, Blue, Yellow
            const ledMaterial = new THREE.MeshBasicMaterial({
                color: ledColors[index],
                emissive: ledColors[index],
                emissiveIntensity: 1.0
            });
            const led = new THREE.Mesh(ledGeometry, ledMaterial);
            led.position.set(pos[0], 0.006, pos[2]);
            group.add(led);
        });

        return group;
    }

    createEnhancedTrail(droneId, color) {
        // Create dashed line trail that stays visible at all distances
        const geometry = new THREE.BufferGeometry();

        // Create dashed line material with consistent visibility at all distances
        const material = new THREE.LineDashedMaterial({
            color: color,
            transparent: true,
            opacity: 0.9,
            linewidth: 4,
            dashSize: 0.15,    // Slightly longer dashes
            gapSize: 0.08,     // Slightly longer gaps
            scale: 1,          // Fixed scale
            depthTest: true,   // Enable depth testing
            depthWrite: true   // Enable depth writing
        });

        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;  // Prevent frustum culling issues
        this.scene.add(line);

        // Also create a glow effect with a second dashed line
        const glowGeometry = new THREE.BufferGeometry();
        const glowMaterial = new THREE.LineDashedMaterial({
            color: color,
            transparent: true,
            opacity: 0.4,
            linewidth: 8,
            dashSize: 0.15,
            gapSize: 0.08,
            scale: 1,
            depthTest: true,
            depthWrite: false  // Glow doesn't write to depth buffer
        });

        const glowLine = new THREE.Line(glowGeometry, glowMaterial);
        glowLine.frustumCulled = false;  // Prevent frustum culling issues
        this.scene.add(glowLine);

        this.droneTrails.set(droneId, {
            line: line,
            glowLine: glowLine,
            positions: [],
            color: color
        });
    }

    updateEnhancedTrail(droneId, newPosition) {
        const trail = this.droneTrails.get(droneId);

        // Add new position
        trail.positions.push(newPosition);

        // Limit trail length
        if (trail.positions.length > this.maxTrailLength) {
            trail.positions.shift();
        }

        // Update main trail
        if (trail.positions.length > 1) {
            const positions = new Float32Array(trail.positions.length * 3);
            trail.positions.forEach((pos, index) => {
                positions[index * 3] = pos.x;
                positions[index * 3 + 1] = pos.y;
                positions[index * 3 + 2] = pos.z;
            });

            trail.line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            trail.line.geometry.attributes.position.needsUpdate = true;

            // Update glow trail with same positions
            trail.glowLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            trail.glowLine.geometry.attributes.position.needsUpdate = true;

            // Compute line distances for dashed effect
            trail.line.computeLineDistances();
            trail.glowLine.computeLineDistances();
        }
    }

    createGoalGeometry() {
        // Enhanced goal with glow effect
        const group = new THREE.Group();

        // Main goal sphere
        const geometry = new THREE.SphereGeometry(0.025, 16, 16);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.7,
            emissive: 0x004400,
            emissiveIntensity: 0.3,
            shininess: 100
        });
        const goal = new THREE.Mesh(geometry, material);
        goal.castShadow = true;
        group.add(goal);

        // Outer glow sphere
        const glowGeometry = new THREE.SphereGeometry(0.035, 12, 12);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.2,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        group.add(glow);

        return group;
    }

    updateDrone(droneData) {
        const droneId = droneData.agent_id;
        const position = droneData.position;
        const rotation = droneData.rotation_matrix;
        const goal = droneData.goal;

        // Create drone if it doesn't exist
        if (!this.drones.has(droneId)) {
            const drone = this.createDroneGeometry();
            const color = this.droneColors[droneId % this.droneColors.length];

            // Set drone color with emissive properties for better visibility
            drone.children.forEach(child => {
                if (child.material && child.material.color) {
                    child.material.color.setHex(color);
                    // Add emissive glow to make drone more visible
                    if (child.material.emissive) {
                        child.material.emissive.setHex(color);
                        child.material.emissiveIntensity = 0.3;
                    }
                }
            });

            this.scene.add(drone);
            this.drones.set(droneId, drone);

            // Initialize enhanced trail with gradient effect
            if (this.showTrails) {
                this.createEnhancedTrail(droneId, color);
            }

            // Create goal marker
            if (this.showGoals) {
                const goalMesh = this.createGoalGeometry();
                this.scene.add(goalMesh);
                this.goals.set(droneId, goalMesh);
            }
        }

        // Update drone position and rotation (direct assignment like pyglet)
        const drone = this.drones.get(droneId);
        drone.position.set(position.x, position.z, position.y); // Note: Y and Z swapped for Three.js

        // Convert rotation matrix to Three.js rotation
        if (rotation && rotation.length === 9) {
            const matrix = new THREE.Matrix4();
            matrix.set(
                rotation[0], rotation[2], rotation[1], 0,
                rotation[6], rotation[8], rotation[7], 0,
                rotation[3], rotation[5], rotation[4], 0,
                0, 0, 0, 1
            );
            drone.setRotationFromMatrix(matrix);
        }

        // Update enhanced trail (like pyglet - every frame)
        if (this.showTrails && this.droneTrails.has(droneId)) {
            this.updateEnhancedTrail(droneId, new THREE.Vector3(position.x, position.z, position.y));
        }

        // Update goal position
        if (this.showGoals && this.goals.has(droneId)) {
            const goalMesh = this.goals.get(droneId);
            goalMesh.position.set(goal.x, goal.z, goal.y); // Note: Y and Z swapped for Three.js
        }

        // Update dynamic camera tracking (only if camera is initialized)
        if (this.cameraInitialized && this.controls) {
            const targetCenter = this.calculateSceneCenter();
            const lerpFactor = 0.02; // Slow, smooth following
            this.controls.target.lerp(targetCenter, lerpFactor);
        }
    }

    toggleTrails() {
        this.showTrails = !this.showTrails;

        this.droneTrails.forEach(trail => {
            if (trail.line) {
                trail.line.visible = this.showTrails;
            }
            if (trail.glowLine) {
                trail.glowLine.visible = this.showTrails;
            }
        });

        return this.showTrails;
    }

    toggleGoals() {
        this.showGoals = !this.showGoals;

        this.goals.forEach(goal => {
            goal.visible = this.showGoals;
        });

        return this.showGoals;
    }

    resetCamera() {
        // Reset camera parameters to initial values
        const globalParams = this.cameraParams.global;
        globalParams.radius = 12;
        globalParams.theta = Math.PI / 3;
        globalParams.phi = 0;

        // Force camera reinitialization
        this.cameraInitialized = false;

        this.setCameraView(this.currentCameraView);
    }

    // Camera view switching methods
    setCameraView(viewName) {
        if (!this.availableCameraViews.includes(viewName)) {
            console.warn(`Unknown camera view: ${viewName}`);
            return;
        }

        this.currentCameraView = viewName;
        this.updateCameraPosition();

        // Reset controls when explicitly changing camera view
        if (this.controls) {
            this.controls.reset();
        }
    }

    nextCameraView() {
        const currentIndex = this.availableCameraViews.indexOf(this.currentCameraView);
        const nextIndex = (currentIndex + 1) % this.availableCameraViews.length;
        this.setCameraView(this.availableCameraViews[nextIndex]);
    }

    previousCameraView() {
        const currentIndex = this.availableCameraViews.indexOf(this.currentCameraView);
        const prevIndex = (currentIndex - 1 + this.availableCameraViews.length) % this.availableCameraViews.length;
        this.setCameraView(this.availableCameraViews[prevIndex]);
    }

    updateCameraPosition() {
        // Calculate the center and bounds of all drones for better framing
        const dronePositions = Array.from(this.drones.values()).map(drone => drone.position);
        let centerPos = { x: 0, y: 2.5, z: 0 };  // Default room center at better height
        let bounds = { minX: -5, maxX: 5, minY: 0, maxY: 10, minZ: -5, maxZ: 5 };

        if (dronePositions.length > 0) {
            centerPos = {
                x: dronePositions.reduce((sum, pos) => sum + pos.x, 0) / dronePositions.length,
                y: dronePositions.reduce((sum, pos) => sum + pos.y, 0) / dronePositions.length,
                z: dronePositions.reduce((sum, pos) => sum + pos.z, 0) / dronePositions.length
            };

            // Calculate bounds of all drones
            bounds = {
                minX: Math.min(...dronePositions.map(pos => pos.x)),
                maxX: Math.max(...dronePositions.map(pos => pos.x)),
                minY: Math.min(...dronePositions.map(pos => pos.y)),
                maxY: Math.max(...dronePositions.map(pos => pos.y)),
                minZ: Math.min(...dronePositions.map(pos => pos.z)),
                maxZ: Math.max(...dronePositions.map(pos => pos.z))
            };
        }

        // Only global camera view available
        this.updateGlobalCamera(centerPos, bounds);

        // Don't reset controls every time - let user maintain their view adjustments
        // Only reset on explicit camera view changes
    }

    updateGlobalCamera(centerPos, bounds) {
        // Only set initial camera position, then let OrbitControls and dynamic tracking handle the rest

        if (!this.cameraInitialized) {
            // Initial camera setup
            const globalParams = this.cameraParams.global;

            // Set initial camera position from front/center view
            const x = centerPos.x + globalParams.radius * Math.sin(globalParams.theta) * Math.cos(globalParams.phi);
            const y = centerPos.y + globalParams.radius * Math.cos(globalParams.theta);
            const z = centerPos.z + globalParams.radius * Math.sin(globalParams.theta) * Math.sin(globalParams.phi);

            this.camera.position.set(x, y, z);

            // Set initial target
            if (this.controls) {
                this.controls.target.set(centerPos.x, centerPos.y, centerPos.z);
            }

            this.cameraInitialized = true;
        }
    }



    // Helper functions for vector operations and smooth transitions
    lerp(start, end, factor) {
        return start + (end - start) * factor;
    }

    normalize(vec) {
        const length = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
        if (length === 0) return { x: 0, y: 0, z: 0 };
        return { x: vec.x / length, y: vec.y / length, z: vec.z / length };
    }

    cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }


    
    getCurrentCameraView() {
        return this.currentCameraView;
    }

    calculateSceneCenter() {
        // Calculate center of all drones and goals for dynamic tracking
        const allPositions = [];

        // Add all drone positions
        this.drones.forEach(drone => {
            allPositions.push(drone.position);
        });

        // Add all goal positions
        this.goals.forEach(goal => {
            allPositions.push(goal.position);
        });

        if (allPositions.length === 0) {
            // No drones or goals, return room center
            return new THREE.Vector3(0, 2.5, 0);
        }

        // Calculate center of all positions
        const center = new THREE.Vector3(0, 0, 0);
        allPositions.forEach(pos => {
            center.add(pos);
        });
        center.divideScalar(allPositions.length);

        return center;
    }

    clearTrails() {
        this.droneTrails.forEach(trail => {
            trail.positions = [];
            trail.line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
            trail.line.geometry.attributes.position.needsUpdate = true;
        });
    }

    removeDrone(droneId) {
        if (this.drones.has(droneId)) {
            this.scene.remove(this.drones.get(droneId));
            this.drones.delete(droneId);
        }

        if (this.droneTrails.has(droneId)) {
            this.scene.remove(this.droneTrails.get(droneId).line);
            this.droneTrails.delete(droneId);
        }

        if (this.goals.has(droneId)) {
            this.scene.remove(this.goals.get(droneId));
            this.goals.delete(droneId);
        }
    }

    onWindowResize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Update floor animation
        if (this.floorMaterial) {
            this.floorMaterial.uniforms.time.value = Date.now() * 0.001;
        }

        // Update sky animation
        if (this.skyMaterial) {
            this.skyMaterial.uniforms.time.value = Date.now() * 0.001;
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        // Clean up resources
        this.drones.forEach(drone => this.scene.remove(drone));
        this.droneTrails.forEach(trail => this.scene.remove(trail.line));
        this.goals.forEach(goal => this.scene.remove(goal));

        this.drones.clear();
        this.droneTrails.clear();
        this.goals.clear();

        this.renderer.dispose();
    }
}
