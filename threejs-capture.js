// ============================================
// Three.js Capture Module v1.0
// Introspects Three.js scenes and generates replication code
// ============================================

(function() {
    'use strict';

    // ============================================
    // THREE.JS DETECTION
    // ============================================

    /**
     * Check if Three.js is available on the page
     */
    function isThreeJsAvailable() {
        return typeof window.THREE !== 'undefined';
    }

    /**
     * Get Three.js version
     */
    function getThreeJsVersion() {
        return window.THREE?.REVISION || null;
    }

    /**
     * Find Three.js renderer instances
     * Three.js doesn't expose renderers globally, so we need heuristics
     */
    function findRenderers() {
        const renderers = [];
        
        // Look for WebGL canvases that might be Three.js
        const canvases = document.querySelectorAll('canvas');
        
        for (const canvas of canvases) {
            try {
                const gl = canvas.getContext('webgl2') || 
                           canvas.getContext('webgl') ||
                           canvas.getContext('experimental-webgl');
                
                if (!gl) continue;
                
                // Check if this looks like a Three.js canvas
                const rect = canvas.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                
                const rendererInfo = {
                    canvas: canvas,
                    id: canvas.id || null,
                    className: canvas.className || null,
                    dimensions: {
                        width: canvas.width,
                        height: canvas.height,
                        displayWidth: rect.width,
                        displayHeight: rect.height
                    },
                    pixelRatio: canvas.width / rect.width || 1,
                    contextType: gl.getParameter(gl.VERSION) || 'WebGL',
                    isLikelyThreeJs: false,
                    hints: []
                };
                
                // Heuristics to detect Three.js
                const classes = canvas.className?.toLowerCase() || '';
                const id = canvas.id?.toLowerCase() || '';
                const parent = canvas.parentElement;
                const parentClasses = parent?.className?.toLowerCase() || '';
                
                if (classes.includes('three') || id.includes('three') ||
                    parentClasses.includes('three')) {
                    rendererInfo.isLikelyThreeJs = true;
                    rendererInfo.hints.push('Class/ID contains "three"');
                }
                
                if (classes.includes('webgl') || id.includes('webgl')) {
                    rendererInfo.hints.push('Class/ID contains "webgl"');
                }
                
                // Check for Three.js specific attributes or data
                if (canvas.dataset?.engine === 'three.js') {
                    rendererInfo.isLikelyThreeJs = true;
                    rendererInfo.hints.push('data-engine attribute');
                }
                
                // If THREE is loaded and canvas is WebGL, likely Three.js
                if (isThreeJsAvailable()) {
                    rendererInfo.isLikelyThreeJs = true;
                    rendererInfo.hints.push('THREE global exists');
                }
                
                renderers.push(rendererInfo);
            } catch (e) {
                // Context access failed
            }
        }
        
        return renderers;
    }

    // ============================================
    // SCENE INTROSPECTION
    // ============================================

    /**
     * Attempt to find and capture Three.js scene objects
     * This is tricky as scenes aren't globally exposed
     */
    function findSceneObjects() {
        const scenes = [];
        
        if (!isThreeJsAvailable()) return scenes;
        
        // Try common patterns developers use
        const commonGlobalNames = [
            'scene', 'mainScene', 'gameScene', 'worldScene',
            'app', 'viewer', 'world', 'game', 'experience',
            'threeScene', 'threeApp', 'three'
        ];
        
        for (const name of commonGlobalNames) {
            const obj = window[name];
            if (obj && isThreeJsScene(obj)) {
                scenes.push({ name, scene: obj, source: 'global' });
            }
            // Check if it's a container object
            if (obj && typeof obj === 'object') {
                if (obj.scene && isThreeJsScene(obj.scene)) {
                    scenes.push({ name: `${name}.scene`, scene: obj.scene, source: 'global.scene' });
                }
                if (obj.world && isThreeJsScene(obj.world)) {
                    scenes.push({ name: `${name}.world`, scene: obj.world, source: 'global.world' });
                }
            }
        }
        
        return scenes;
    }

    /**
     * Check if an object is a Three.js Scene
     */
    function isThreeJsScene(obj) {
        if (!obj) return false;
        
        // Check for Scene type
        if (window.THREE?.Scene && obj instanceof window.THREE.Scene) {
            return true;
        }
        
        // Duck typing
        return obj.isScene === true || 
               (obj.type === 'Scene' && typeof obj.children !== 'undefined');
    }

    /**
     * Extract scene graph data from a Three.js scene
     */
    function extractSceneGraph(scene, maxDepth = 10) {
        if (!scene) return null;
        
        function processObject(obj, depth = 0) {
            if (!obj || depth > maxDepth) return null;
            
            const data = {
                uuid: obj.uuid,
                name: obj.name || null,
                type: obj.type || obj.constructor?.name || 'Object3D',
                visible: obj.visible !== false,
                position: obj.position ? {
                    x: obj.position.x,
                    y: obj.position.y,
                    z: obj.position.z
                } : null,
                rotation: obj.rotation ? {
                    x: obj.rotation.x,
                    y: obj.rotation.y,
                    z: obj.rotation.z,
                    order: obj.rotation.order
                } : null,
                scale: obj.scale ? {
                    x: obj.scale.x,
                    y: obj.scale.y,
                    z: obj.scale.z
                } : null,
                children: []
            };
            
            // Extract type-specific properties
            if (obj.isCamera || obj.type?.includes('Camera')) {
                data.cameraData = extractCameraData(obj);
            }
            
            if (obj.isLight || obj.type?.includes('Light')) {
                data.lightData = extractLightData(obj);
            }
            
            if (obj.isMesh || obj.type === 'Mesh') {
                data.meshData = extractMeshData(obj);
            }
            
            if (obj.isGroup || obj.type === 'Group') {
                data.isGroup = true;
            }
            
            // Process children
            if (obj.children && obj.children.length > 0) {
                for (const child of obj.children) {
                    const childData = processObject(child, depth + 1);
                    if (childData) {
                        data.children.push(childData);
                    }
                }
            }
            
            return data;
        }
        
        return processObject(scene);
    }

    /**
     * Extract camera data
     */
    function extractCameraData(camera) {
        const data = {
            type: camera.type || 'Camera',
            near: camera.near,
            far: camera.far
        };
        
        if (camera.isPerspectiveCamera || camera.type === 'PerspectiveCamera') {
            data.fov = camera.fov;
            data.aspect = camera.aspect;
            data.zoom = camera.zoom;
        }
        
        if (camera.isOrthographicCamera || camera.type === 'OrthographicCamera') {
            data.left = camera.left;
            data.right = camera.right;
            data.top = camera.top;
            data.bottom = camera.bottom;
            data.zoom = camera.zoom;
        }
        
        return data;
    }

    /**
     * Extract light data
     */
    function extractLightData(light) {
        const data = {
            type: light.type || 'Light',
            color: light.color ? `#${light.color.getHexString()}` : null,
            intensity: light.intensity
        };
        
        if (light.isDirectionalLight || light.type === 'DirectionalLight') {
            data.castShadow = light.castShadow;
            if (light.target) {
                data.target = {
                    x: light.target.position.x,
                    y: light.target.position.y,
                    z: light.target.position.z
                };
            }
        }
        
        if (light.isPointLight || light.type === 'PointLight') {
            data.distance = light.distance;
            data.decay = light.decay;
            data.castShadow = light.castShadow;
        }
        
        if (light.isSpotLight || light.type === 'SpotLight') {
            data.distance = light.distance;
            data.angle = light.angle;
            data.penumbra = light.penumbra;
            data.decay = light.decay;
            data.castShadow = light.castShadow;
        }
        
        if (light.isAmbientLight || light.type === 'AmbientLight') {
            // Ambient light has no position or target
        }
        
        if (light.isHemisphereLight || light.type === 'HemisphereLight') {
            data.groundColor = light.groundColor ? `#${light.groundColor.getHexString()}` : null;
        }
        
        return data;
    }

    /**
     * Extract mesh data
     */
    function extractMeshData(mesh) {
        const data = {
            type: 'Mesh',
            geometry: null,
            material: null,
            castShadow: mesh.castShadow,
            receiveShadow: mesh.receiveShadow
        };
        
        // Geometry info
        if (mesh.geometry) {
            const geo = mesh.geometry;
            data.geometry = {
                type: geo.type || geo.constructor?.name || 'BufferGeometry',
                uuid: geo.uuid
            };
            
            // Extract geometry parameters if available
            if (geo.parameters) {
                data.geometry.parameters = { ...geo.parameters };
            }
            
            // For buffer geometries, get vertex count
            if (geo.attributes?.position) {
                data.geometry.vertexCount = geo.attributes.position.count;
            }
        }
        
        // Material info
        if (mesh.material) {
            data.material = extractMaterialData(mesh.material);
        }
        
        return data;
    }

    /**
     * Extract material data
     */
    function extractMaterialData(material) {
        if (!material) return null;
        
        // Handle material arrays
        if (Array.isArray(material)) {
            return material.map(m => extractMaterialData(m));
        }
        
        const data = {
            type: material.type || material.constructor?.name || 'Material',
            uuid: material.uuid,
            name: material.name || null,
            visible: material.visible !== false,
            transparent: material.transparent,
            opacity: material.opacity,
            side: material.side, // 0=Front, 1=Back, 2=Double
            wireframe: material.wireframe
        };
        
        // Color
        if (material.color) {
            data.color = `#${material.color.getHexString()}`;
        }
        
        // Emissive
        if (material.emissive) {
            data.emissive = `#${material.emissive.getHexString()}`;
            data.emissiveIntensity = material.emissiveIntensity;
        }
        
        // Standard/Physical material properties
        if (material.roughness !== undefined) data.roughness = material.roughness;
        if (material.metalness !== undefined) data.metalness = material.metalness;
        if (material.clearcoat !== undefined) data.clearcoat = material.clearcoat;
        if (material.clearcoatRoughness !== undefined) data.clearcoatRoughness = material.clearcoatRoughness;
        
        // Textures (just note that they exist)
        const textureProps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 
                             'emissiveMap', 'aoMap', 'bumpMap', 'envMap'];
        data.textures = {};
        for (const prop of textureProps) {
            if (material[prop]) {
                data.textures[prop] = {
                    exists: true,
                    uuid: material[prop].uuid,
                    name: material[prop].name || null,
                    sourceUrl: material[prop].image?.src || null
                };
            }
        }
        
        return data;
    }

    // ============================================
    // ANIMATION CAPTURE
    // ============================================

    /**
     * Find and extract Three.js AnimationMixers
     */
    function findAnimationMixers() {
        const mixers = [];
        
        // Try common global names
        const commonNames = ['mixer', 'animationMixer', 'animations'];
        
        for (const name of commonNames) {
            const obj = window[name];
            if (obj && isAnimationMixer(obj)) {
                mixers.push({
                    name,
                    source: 'global',
                    data: extractMixerData(obj)
                });
            }
        }
        
        return mixers;
    }

    function isAnimationMixer(obj) {
        return obj && (
            (window.THREE?.AnimationMixer && obj instanceof window.THREE.AnimationMixer) ||
            (obj._root && obj._actions && typeof obj.update === 'function')
        );
    }

    function extractMixerData(mixer) {
        if (!mixer) return null;
        
        const data = {
            time: mixer.time,
            timeScale: mixer.timeScale,
            actions: []
        };
        
        // Extract action data
        if (mixer._actions) {
            for (const action of mixer._actions) {
                data.actions.push({
                    clipName: action._clip?.name || null,
                    clipDuration: action._clip?.duration || null,
                    enabled: action.enabled,
                    paused: action.paused,
                    loop: action.loop,
                    repetitions: action.repetitions,
                    weight: action.weight,
                    timeScale: action.timeScale
                });
            }
        }
        
        return data;
    }

    // ============================================
    // CANVAS SNAPSHOT
    // ============================================

    /**
     * Capture snapshots of a Three.js canvas over time
     */
    async function captureCanvasSnapshots(canvas, count = 5, intervalMs = 100) {
        const snapshots = [];
        
        for (let i = 0; i < count; i++) {
            try {
                const dataUrl = canvas.toDataURL('image/png');
                snapshots.push({
                    index: i,
                    timestamp: Date.now(),
                    dataUrl: dataUrl.length > 50000 ? 
                        await compressDataUrl(dataUrl) : dataUrl
                });
            } catch (e) {
                console.warn('[ThreeJSCapture] Canvas snapshot failed:', e);
            }
            
            if (i < count - 1) {
                await sleep(intervalMs);
            }
        }
        
        return snapshots;
    }

    async function compressDataUrl(dataUrl, quality = 0.7, maxDim = 800) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================
    // CODE GENERATION
    // ============================================

    /**
     * Generate Three.js setup code from captured data
     */
    function generateThreeJsCode(captureData) {
        const lines = [];
        
        lines.push('// ============================================');
        lines.push('// Three.js Scene Setup');
        lines.push('// Generated by Design Copier Extension');
        lines.push('// ============================================');
        lines.push('');
        lines.push('import * as THREE from \'three\';');
        lines.push('');
        
        // Scene setup
        lines.push('// Scene');
        lines.push('const scene = new THREE.Scene();');
        if (captureData.sceneData?.background) {
            lines.push(`scene.background = new THREE.Color('${captureData.sceneData.background}');`);
        }
        lines.push('');
        
        // Camera setup
        if (captureData.camera) {
            const cam = captureData.camera;
            lines.push('// Camera');
            if (cam.type === 'PerspectiveCamera') {
                lines.push(`const camera = new THREE.PerspectiveCamera(${cam.fov || 75}, ${cam.aspect || 'window.innerWidth / window.innerHeight'}, ${cam.near || 0.1}, ${cam.far || 1000});`);
            } else if (cam.type === 'OrthographicCamera') {
                lines.push(`const camera = new THREE.OrthographicCamera(${cam.left}, ${cam.right}, ${cam.top}, ${cam.bottom}, ${cam.near}, ${cam.far});`);
            } else {
                lines.push(`const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);`);
            }
            if (cam.position) {
                lines.push(`camera.position.set(${cam.position.x}, ${cam.position.y}, ${cam.position.z});`);
            }
            lines.push('');
        }
        
        // Renderer setup
        lines.push('// Renderer');
        const renderer = captureData.renderer || {};
        lines.push(`const renderer = new THREE.WebGLRenderer({ antialias: true });`);
        lines.push(`renderer.setSize(${renderer.width || 'window.innerWidth'}, ${renderer.height || 'window.innerHeight'});`);
        if (renderer.pixelRatio) {
            lines.push(`renderer.setPixelRatio(${renderer.pixelRatio});`);
        }
        lines.push('document.body.appendChild(renderer.domElement);');
        lines.push('');
        
        // Lights
        if (captureData.lights && captureData.lights.length > 0) {
            lines.push('// Lights');
            for (let i = 0; i < captureData.lights.length; i++) {
                const light = captureData.lights[i];
                const varName = `light${i + 1}`;
                
                switch (light.type) {
                    case 'AmbientLight':
                        lines.push(`const ${varName} = new THREE.AmbientLight('${light.color || '#ffffff'}', ${light.intensity || 1});`);
                        break;
                    case 'DirectionalLight':
                        lines.push(`const ${varName} = new THREE.DirectionalLight('${light.color || '#ffffff'}', ${light.intensity || 1});`);
                        if (light.position) {
                            lines.push(`${varName}.position.set(${light.position.x}, ${light.position.y}, ${light.position.z});`);
                        }
                        break;
                    case 'PointLight':
                        lines.push(`const ${varName} = new THREE.PointLight('${light.color || '#ffffff'}', ${light.intensity || 1}, ${light.distance || 0});`);
                        if (light.position) {
                            lines.push(`${varName}.position.set(${light.position.x}, ${light.position.y}, ${light.position.z});`);
                        }
                        break;
                    case 'SpotLight':
                        lines.push(`const ${varName} = new THREE.SpotLight('${light.color || '#ffffff'}', ${light.intensity || 1});`);
                        if (light.position) {
                            lines.push(`${varName}.position.set(${light.position.x}, ${light.position.y}, ${light.position.z});`);
                        }
                        break;
                    case 'HemisphereLight':
                        lines.push(`const ${varName} = new THREE.HemisphereLight('${light.color || '#ffffff'}', '${light.groundColor || '#444444'}', ${light.intensity || 1});`);
                        break;
                    default:
                        lines.push(`const ${varName} = new THREE.AmbientLight('${light.color || '#ffffff'}', ${light.intensity || 1});`);
                }
                lines.push(`scene.add(${varName});`);
            }
            lines.push('');
        }
        
        // Meshes
        if (captureData.meshes && captureData.meshes.length > 0) {
            lines.push('// Meshes');
            for (let i = 0; i < captureData.meshes.length; i++) {
                const mesh = captureData.meshes[i];
                const varName = mesh.name || `mesh${i + 1}`;
                
                // Geometry
                const geoType = mesh.geometry?.type || 'BoxGeometry';
                const geoParams = mesh.geometry?.parameters || {};
                let geoCode = `new THREE.${geoType}(`;
                
                // Add geometry parameters based on type
                if (geoType === 'BoxGeometry') {
                    geoCode += `${geoParams.width || 1}, ${geoParams.height || 1}, ${geoParams.depth || 1}`;
                } else if (geoType === 'SphereGeometry') {
                    geoCode += `${geoParams.radius || 1}, ${geoParams.widthSegments || 32}, ${geoParams.heightSegments || 16}`;
                } else if (geoType === 'PlaneGeometry') {
                    geoCode += `${geoParams.width || 1}, ${geoParams.height || 1}`;
                } else if (geoType === 'CylinderGeometry') {
                    geoCode += `${geoParams.radiusTop || 1}, ${geoParams.radiusBottom || 1}, ${geoParams.height || 1}`;
                }
                geoCode += ')';
                
                // Material
                const matType = mesh.material?.type || 'MeshStandardMaterial';
                let matParams = [];
                if (mesh.material?.color) matParams.push(`color: '${mesh.material.color}'`);
                if (mesh.material?.roughness !== undefined) matParams.push(`roughness: ${mesh.material.roughness}`);
                if (mesh.material?.metalness !== undefined) matParams.push(`metalness: ${mesh.material.metalness}`);
                if (mesh.material?.transparent) matParams.push(`transparent: true`);
                if (mesh.material?.opacity !== undefined && mesh.material.opacity < 1) matParams.push(`opacity: ${mesh.material.opacity}`);
                
                const matCode = `new THREE.${matType}({ ${matParams.join(', ')} })`;
                
                lines.push(`const ${varName}Geo = ${geoCode};`);
                lines.push(`const ${varName}Mat = ${matCode};`);
                lines.push(`const ${varName} = new THREE.Mesh(${varName}Geo, ${varName}Mat);`);
                
                if (mesh.position) {
                    lines.push(`${varName}.position.set(${mesh.position.x}, ${mesh.position.y}, ${mesh.position.z});`);
                }
                if (mesh.rotation && (mesh.rotation.x !== 0 || mesh.rotation.y !== 0 || mesh.rotation.z !== 0)) {
                    lines.push(`${varName}.rotation.set(${mesh.rotation.x}, ${mesh.rotation.y}, ${mesh.rotation.z});`);
                }
                if (mesh.scale && (mesh.scale.x !== 1 || mesh.scale.y !== 1 || mesh.scale.z !== 1)) {
                    lines.push(`${varName}.scale.set(${mesh.scale.x}, ${mesh.scale.y}, ${mesh.scale.z});`);
                }
                
                lines.push(`scene.add(${varName});`);
                lines.push('');
            }
        }
        
        // Animation loop
        lines.push('// Animation loop');
        lines.push('function animate() {');
        lines.push('    requestAnimationFrame(animate);');
        if (captureData.hasRotation) {
            lines.push('    // TODO: Add your animation logic here');
            lines.push('    // Example: mesh.rotation.y += 0.01;');
        }
        lines.push('    renderer.render(scene, camera);');
        lines.push('}');
        lines.push('');
        lines.push('animate();');
        lines.push('');
        
        // Resize handler
        lines.push('// Handle window resize');
        lines.push('window.addEventListener(\'resize\', () => {');
        lines.push('    camera.aspect = window.innerWidth / window.innerHeight;');
        lines.push('    camera.updateProjectionMatrix();');
        lines.push('    renderer.setSize(window.innerWidth, window.innerHeight);');
        lines.push('});');
        
        return lines.join('\n');
    }

    // ============================================
    // MAIN CAPTURE FUNCTION
    // ============================================

    /**
     * Capture all Three.js data from the page
     */
    async function captureThreeJs(targetElement = null) {
        const result = {
            isThreeJsAvailable: isThreeJsAvailable(),
            version: getThreeJsVersion(),
            renderers: [],
            scenes: [],
            animations: [],
            snapshots: [],
            generatedCode: null
        };
        
        if (!result.isThreeJsAvailable) {
            result.notes = ['Three.js not detected on this page'];
            return result;
        }
        
        // Find renderers
        result.renderers = findRenderers();
        
        // Find scene objects
        const sceneResults = findSceneObjects();
        for (const sceneResult of sceneResults) {
            const sceneData = extractSceneGraph(sceneResult.scene);
            result.scenes.push({
                name: sceneResult.name,
                source: sceneResult.source,
                data: sceneData
            });
        }
        
        // Find animation mixers
        result.animations = findAnimationMixers();
        
        // Capture snapshots from the first found renderer
        if (result.renderers.length > 0) {
            const targetCanvas = targetElement?.tagName === 'CANVAS' ? 
                targetElement : result.renderers[0].canvas;
            
            if (targetCanvas) {
                try {
                    result.snapshots = await captureCanvasSnapshots(targetCanvas, 3, 200);
                } catch (e) {
                    console.warn('[ThreeJSCapture] Snapshot capture failed:', e);
                }
            }
        }
        
        // Generate code if we captured scene data
        if (result.scenes.length > 0) {
            const sceneData = result.scenes[0].data;
            const codeGenData = prepareCodeGenData(sceneData, result.renderers[0]);
            result.generatedCode = generateThreeJsCode(codeGenData);
        } else if (result.renderers.length > 0) {
            // Generate basic code even without scene access
            result.generatedCode = generateThreeJsCode({
                renderer: result.renderers[0].dimensions,
                camera: { type: 'PerspectiveCamera', position: { x: 0, y: 0, z: 5 } },
                lights: [{ type: 'AmbientLight', color: '#ffffff', intensity: 1 }],
                meshes: [],
                hasRotation: true
            });
            result.notes = result.notes || [];
            result.notes.push('Could not access scene objects - generated basic setup code');
        }
        
        return result;
    }

    /**
     * Prepare data for code generation from scene graph
     */
    function prepareCodeGenData(sceneData, rendererInfo) {
        const data = {
            renderer: rendererInfo?.dimensions || {},
            camera: null,
            lights: [],
            meshes: [],
            hasRotation: false
        };
        
        function processNode(node) {
            if (!node) return;
            
            if (node.cameraData) {
                data.camera = {
                    ...node.cameraData,
                    position: node.position,
                    rotation: node.rotation
                };
            }
            
            if (node.lightData) {
                data.lights.push({
                    ...node.lightData,
                    position: node.position
                });
            }
            
            if (node.meshData) {
                data.meshes.push({
                    name: node.name,
                    position: node.position,
                    rotation: node.rotation,
                    scale: node.scale,
                    geometry: node.meshData.geometry,
                    material: node.meshData.material
                });
            }
            
            // Check for rotation animation hints
            if (node.rotation && (node.rotation.x !== 0 || node.rotation.y !== 0 || node.rotation.z !== 0)) {
                data.hasRotation = true;
            }
            
            // Process children
            for (const child of node.children || []) {
                processNode(child);
            }
        }
        
        processNode(sceneData);
        
        // Add default camera if none found
        if (!data.camera) {
            data.camera = {
                type: 'PerspectiveCamera',
                fov: 75,
                near: 0.1,
                far: 1000,
                position: { x: 0, y: 0, z: 5 }
            };
        }
        
        // Add default light if none found
        if (data.lights.length === 0) {
            data.lights.push({
                type: 'AmbientLight',
                color: '#ffffff',
                intensity: 1
            });
        }
        
        return data;
    }

    // ============================================
    // EXPORTS
    // ============================================

    window.ThreeJSCapture = {
        // Main capture
        captureThreeJs,
        
        // Detection
        isThreeJsAvailable,
        getThreeJsVersion,
        findRenderers,
        findSceneObjects,
        
        // Extraction
        extractSceneGraph,
        extractCameraData,
        extractLightData,
        extractMeshData,
        extractMaterialData,
        
        // Animations
        findAnimationMixers,
        
        // Snapshots
        captureCanvasSnapshots,
        
        // Code generation
        generateThreeJsCode,
        prepareCodeGenData
    };

    console.log('[ThreeJSCapture] Module loaded - v1.0');
})();

