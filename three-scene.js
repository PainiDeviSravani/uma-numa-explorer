// ======================================================
// UMA vs NUMA | Memory Architecture Lab
// Interactive 3D visualization using Three.js r128
// ======================================================

(() => {
    "use strict";

    const container = document.getElementById("three-container");

    if (!container || !window.THREE) {
        console.warn("3D scene unavailable. Check the Three.js script and container.");
        return;
    }

    const THREE = window.THREE;

    let scene;
    let camera;
    let renderer;
    let architectureGroup;
    let animationFrame;
    let currentMode = "UMA";
    let entranceFrame = null;

    const packets = [];
    const animatedObjects = [];

    const colors = {
        background: 0xf6f9ff,
        cpu: 0x3678e8,
        cpuLight: 0x8bb8ff,
        memory: 0x20a58a,
        memoryLight: 0x83e2cc,
        interconnect: 0x8ca3c7,
        text: 0x29415f,
        packet: 0xf59e0b,
        node: 0xe6efff,
        white: 0xffffff
    };

    // --------------------------------------------------
    // Scene setup
    // --------------------------------------------------

    scene = new THREE.Scene();
    scene.background = new THREE.Color(colors.background);

    camera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / Math.max(container.clientHeight, 1),
        0.1,
        1000
    );

    camera.position.set(0, 7.5, 14);
    camera.lookAt(0, 0.5, 0);

    try {
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });
    } catch (error) {
        container.innerHTML =
            '<p style="padding:24px;color:#29415f;">Your browser could not start the 3D view. Try enabling hardware acceleration or using another browser.</p>';
        console.warn("Unable to initialize WebGL:", error);
        return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.1);
    mainLight.position.set(6, 12, 8);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xb8d7ff, 0.55);
    fillLight.position.set(-8, 5, -5);
    scene.add(fillLight);

    // Subtle floor
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 30),
        new THREE.MeshStandardMaterial({
            color: 0xf0f5fc,
            roughness: 0.95,
            metalness: 0
        })
    );

    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.75;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid for depth
    const grid = new THREE.GridHelper(30, 30, 0xd5e1f1, 0xe4ebf5);
    grid.position.y = -0.73;
    scene.add(grid);

    architectureGroup = new THREE.Group();
    scene.add(architectureGroup);

    // --------------------------------------------------
    // Reusable 3D helpers
    // --------------------------------------------------

    function makeMaterial(color, extra = {}) {
        return new THREE.MeshStandardMaterial({
            color,
            roughness: 0.55,
            metalness: 0.05,
            ...extra
        });
    }

    function addBox(parent, position, size, color, radiusStyle = false) {
        // BoxGeometry is used for broad browser compatibility.
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(size.x, size.y, size.z),
            makeMaterial(color)
        );

        mesh.position.set(position.x, position.y, position.z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);

        return mesh;
    }

    function addCylinder(parent, position, radius, height, color) {
        const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, height, 32),
            makeMaterial(color)
        );

        mesh.position.set(position.x, position.y, position.z);
        mesh.castShadow = true;
        parent.add(mesh);

        return mesh;
    }

    function addLine(parent, points, color, opacity = 0.95) {
        const geometry = new THREE.BufferGeometry().setFromPoints(
            points.map(point =>
                new THREE.Vector3(point.x, point.y, point.z)
            )
        );

        const material = new THREE.LineBasicMaterial({
            color,
            transparent: opacity < 1,
            opacity
        });

        const line = new THREE.Line(geometry, material);
        parent.add(line);

        return line;
    }

    function addLabel(parent, text, position, color = colors.text) {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = 512;
        canvas.height = 128;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = "bold 36px Arial";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#" + color.toString(16).padStart(6, "0");
        context.fillText(text, canvas.width / 2, canvas.height / 2, 490);

        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false
        });

        const sprite = new THREE.Sprite(material);
        sprite.position.set(position.x, position.y, position.z);
        sprite.scale.set(2.5, 0.62, 1);

        parent.add(sprite);
        return sprite;
    }

    function addPacket(parent, start, end, speed = 0.012, color = colors.packet) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.105, 16, 16),
            new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.25,
                roughness: 0.3
            })
        );

        mesh.position.set(start.x, start.y, start.z);
        parent.add(mesh);

        packets.push({
            mesh,
            start: new THREE.Vector3(start.x, start.y, start.z),
            end: new THREE.Vector3(end.x, end.y, end.z),
            progress: Math.random(),
            speed
        });
    }

    function addCpu(parent, x, z, label) {
        // CPU base and processor chip
        addBox(
            parent,
            { x, y: -0.03, z },
            { x: 1.75, y: 0.25, z: 1.35 },
            0xd8e5f8
        );

        addBox(
            parent,
            { x, y: 0.27, z },
            { x: 1.25, y: 0.55, z: 0.95 },
            colors.cpu
        );

        addBox(
            parent,
            { x, y: 0.57, z },
            { x: 0.8, y: 0.08, z: 0.58 },
            colors.cpuLight
        );

        addLabel(parent, label, { x, y: 1.15, z });
    }

    function addMemory(parent, x, z, label) {
        // Memory module
        addBox(
            parent,
            { x, y: 0.03, z },
            { x: 1.75, y: 0.2, z: 1.25 },
            0xc9eee5
        );

        addBox(
            parent,
            { x, y: 0.32, z },
            { x: 1.35, y: 0.48, z: 0.9 },
            colors.memory
        );

        for (let i = -2; i <= 2; i++) {
            addBox(
                parent,
                { x: x + i * 0.21, y: 0.59, z },
                { x: 0.09, y: 0.08, z: 0.58 },
                colors.memoryLight
            );
        }

        addLabel(parent, label, { x, y: 1.12, z });
    }

    function clearArchitecture() {
        while (architectureGroup.children.length > 0) {
            const object = architectureGroup.children[0];

            architectureGroup.remove(object);

            object.traverse(child => {
                if (child.geometry) {
                    child.geometry.dispose();
                }

                if (child.material) {
                    const materials = Array.isArray(child.material)
                        ? child.material
                        : [child.material];

                    materials.forEach(material => {
                        if (material.map) {
                            material.map.dispose();
                        }

                        material.dispose();
                    });
                }
            });
        }

        packets.length = 0;
        animatedObjects.length = 0;
    }

    // --------------------------------------------------
    // UMA: processors share one main memory
    // --------------------------------------------------

    function buildUMA() {
        clearArchitecture();
        currentMode = "UMA";

        const cpuPositions = [
            { x: -4.5, z: -2.3 },
            { x: -1.5, z: -2.3 },
            { x: 1.5, z: -2.3 },
            { x: 4.5, z: -2.3 }
        ];

        const memoryPosition = { x: 0, z: 2.2 };

        // Shared bus
        addLine(
            architectureGroup,
            [
                { x: -5.5, y: 0.1, z: -0.1 },
                { x: 5.5, y: 0.1, z: -0.1 }
            ],
            colors.interconnect,
            1
        );

        addLine(
            architectureGroup,
            [
                { x: 0, y: 0.1, z: -0.1 },
                { x: 0, y: 0.1, z: 1.35 }
            ],
            colors.interconnect,
            1
        );

        cpuPositions.forEach((position, index) => {
            addCpu(
                architectureGroup,
                position.x,
                position.z,
                "CPU " + (index + 1)
            );

            const start = {
                x: position.x,
                y: 0.2,
                z: position.z + 0.85
            };

            const end = {
                x: memoryPosition.x,
                y: 0.2,
                z: memoryPosition.z - 0.75
            };

            addLine(
                architectureGroup,
                [
                    start,
                    { x: position.x, y: 0.1, z: -0.1 },
                    { x: 0, y: 0.1, z: -0.1 },
                    { x: 0, y: 0.1, z: 1.3 },
                    end
                ],
                0x7e9bc7,
                0.85
            );

            addPacket(architectureGroup, start, end, 0.009);
            addPacket(architectureGroup, end, start, 0.007, colors.cpuLight);
        });

        addMemory(
            architectureGroup,
            memoryPosition.x,
            memoryPosition.z,
            "SHARED MEMORY"
        );

        addLabel(
            architectureGroup,
            "Shared interconnect",
            { x: 0, y: 0.9, z: -0.05 },
            0x58708e
        );

        addLabel(
            architectureGroup,
            "UMA",
            { x: 0, y: 2.0, z: -3.6 },
            colors.cpu
        );
    }

    // --------------------------------------------------
    // NUMA: each node has local memory
    // --------------------------------------------------

    function buildNUMA() {
        clearArchitecture();
        currentMode = "NUMA";

        const nodes = [
            { x: -4.1, z: 0, label: "NODE 1" },
            { x: 0, z: 0, label: "NODE 2" },
            { x: 4.1, z: 0, label: "NODE 3" }
        ];

        // Interconnect between nodes
        addLine(
            architectureGroup,
            [
                { x: -5.1, y: 0.12, z: -0.05 },
                { x: 5.1, y: 0.12, z: -0.05 }
            ],
            colors.interconnect,
            1
        );

        nodes.forEach((node, index) => {
            // Each node has its own CPU and local memory
            addBox(
                architectureGroup,
                { x: node.x, y: -0.48, z: 0 },
                { x: 3.4, y: 0.12, z: 5.4 },
                0xe6efff
            );

            addLabel(
                architectureGroup,
                node.label,
                { x: node.x, y: 1.9, z: -2.1 },
                colors.cpu
            );

            const cpu = { x: node.x, z: -1.1 };
            const memory = { x: node.x, z: 1.15 };

            addCpu(
                architectureGroup,
                cpu.x,
                cpu.z,
                "CPU " + (index + 1)
            );

            addMemory(
                architectureGroup,
                memory.x,
                memory.z,
                "LOCAL MEMORY"
            );

            const cpuPort = {
                x: cpu.x,
                y: 0.1,
                z: -0.05
            };

            const memoryPort = {
                x: memory.x,
                y: 0.1,
                z: -0.05
            };

            // Local access path
            addLine(
                architectureGroup,
                [
                    { x: cpu.x, y: 0.12, z: -0.25 },
                    cpuPort,
                    memoryPort,
                    { x: memory.x, y: 0.12, z: 0.45 }
                ],
                colors.memory,
                1
            );

            addPacket(
                architectureGroup,
                { x: cpu.x, y: 0.25, z: -0.3 },
                { x: memory.x, y: 0.25, z: 0.5 },
                0.009,
                colors.memoryLight
            );

            addPacket(
                architectureGroup,
                { x: memory.x, y: 0.25, z: 0.5 },
                { x: cpu.x, y: 0.25, z: -0.3 },
                0.007,
                colors.packet
            );
        });

        // Remote access paths between nodes
        addLine(
            architectureGroup,
            [
                { x: -4.1, y: 0.16, z: -0.05 },
                { x: 0, y: 0.16, z: -0.05 }
            ],
            0x9a80db,
            0.95
        );

        addLine(
            architectureGroup,
            [
                { x: 0, y: 0.16, z: -0.05 },
                { x: 4.1, y: 0.16, z: -0.05 }
            ],
            0x9a80db,
            0.95
        );

        addPacket(
            architectureGroup,
            { x: -4.1, y: 0.3, z: -0.05 },
            { x: 4.1, y: 0.3, z: -0.05 },
            0.006,
            0x9a80db
        );

        addPacket(
            architectureGroup,
            { x: 4.1, y: 0.3, z: -0.05 },
            { x: -4.1, y: 0.3, z: -0.05 },
            0.005,
            0xf59e0b
        );

        addLabel(
            architectureGroup,
            "Node interconnect",
            { x: 0, y: 0.85, z: -0.1 },
            0x7257b6
        );

        addLabel(
            architectureGroup,
            "NUMA",
            { x: 0, y: 2.5, z: -3.6 },
            colors.cpu
        );
    }

    // --------------------------------------------------
    // Switch between architectures
    // --------------------------------------------------

    function setArchitecture(mode) {
        const normalizedMode = String(mode || "UMA").toUpperCase();

        if (entranceFrame !== null) {
            cancelAnimationFrame(entranceFrame);
            entranceFrame = null;
        }

        if (normalizedMode === "NUMA") {
            buildNUMA();
        } else {
            buildUMA();
        }

        architectureGroup.position.x = 8;

        const startTime = performance.now();
        const duration = 700;

        function animateEntrance(now) {
            const progress = Math.min(
                (now - startTime) / duration,
                1
            );

            const eased = 1 - Math.pow(1 - progress, 3);

            architectureGroup.position.x = 8 * (1 - eased);

            if (progress < 1) {
                entranceFrame = requestAnimationFrame(animateEntrance);
            } else {
                architectureGroup.position.x = 0;
                entranceFrame = null;
            }
        }

        entranceFrame = requestAnimationFrame(animateEntrance);
    }

    window.addEventListener("architectureChange", event => {
        const requestedMode =
            event.detail && event.detail.architecture
                ? event.detail.architecture
                : "UMA";

        setArchitecture(requestedMode);
    });

    // --------------------------------------------------
    // Animation loop
    // --------------------------------------------------

    const clock = new THREE.Clock();

    function animate() {
        animationFrame = requestAnimationFrame(animate);

        const delta = Math.min(clock.getDelta(), 0.05);

        packets.forEach(packet => {
            packet.progress += packet.speed * delta * 60;

            if (packet.progress > 1) {
                packet.progress = 0;
            }

            packet.mesh.position.lerpVectors(
                packet.start,
                packet.end,
                packet.progress
            );

            // Small pulse makes data movement easier to see.
            const pulse =
                1 + Math.sin(packet.progress * Math.PI * 8) * 0.12;

            packet.mesh.scale.setScalar(pulse);
        });

        // Gentle rotation keeps the model lively without distracting.
        if (architectureGroup) {
            architectureGroup.rotation.y =
                Math.sin(clock.elapsedTime * 0.18) * 0.035;
        }

        renderer.render(scene, camera);
    }

    // --------------------------------------------------
    // Responsive sizing
    // --------------------------------------------------

    function resizeScene() {
        if (!container.clientWidth || !container.clientHeight) {
            return;
        }

        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(
            container.clientWidth,
            container.clientHeight
        );
    }

    window.addEventListener("resize", resizeScene);

    if ("ResizeObserver" in window) {
        const resizeObserver = new ResizeObserver(resizeScene);
        resizeObserver.observe(container);
    }

    // Optional subtle pointer tilt
    container.addEventListener("pointermove", event => {
        const bounds = container.getBoundingClientRect();

        const normalizedX =
            (event.clientX - bounds.left) / bounds.width - 0.5;

        const normalizedY =
            (event.clientY - bounds.top) / bounds.height - 0.5;

        camera.position.x = normalizedX * 1.2;
        camera.position.y = 7.5 - normalizedY * 0.7;

        camera.lookAt(0, 0.5, 0);
    });

    container.addEventListener("pointerleave", () => {
        camera.position.x = 0;
        camera.position.y = 7.5;
        camera.lookAt(0, 0.5, 0);
    });

    // Start in UMA mode.
    buildUMA();
    resizeScene();
    animate();

    // Optional cleanup hook for page integrations.
    window.stopMemoryArchitectureScene = function () {
        cancelAnimationFrame(animationFrame);

        if (entranceFrame !== null) {
            cancelAnimationFrame(entranceFrame);
        }

        window.removeEventListener("resize", resizeScene);
        renderer.dispose();
    };
})();