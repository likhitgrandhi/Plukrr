// ============================================
// Canvas Animation Capture Module v1.0
// Captures canvas snapshots, analyzes animation patterns,
// and generates canvas animation code
// ============================================

(function() {
    'use strict';

    // ============================================
    // CANVAS DETECTION
    // ============================================

    /**
     * Find all canvas elements in an element or document
     */
    function findCanvasElements(root = document) {
        const canvases = [];
        const elements = root === document ? 
            document.querySelectorAll('canvas') :
            (root.tagName === 'CANVAS' ? [root] : root.querySelectorAll('canvas'));
        
        for (const canvas of elements) {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            
            canvases.push({
                element: canvas,
                id: canvas.id || null,
                className: canvas.className || null,
                dimensions: {
                    width: canvas.width,
                    height: canvas.height,
                    displayWidth: rect.width,
                    displayHeight: rect.height
                },
                contextType: detectContextType(canvas),
                isAnimated: false,
                animationHints: detectAnimationHints(canvas)
            });
        }
        
        return canvases;
    }

    /**
     * Detect the rendering context type of a canvas
     */
    function detectContextType(canvas) {
        // Try different context types
        const contexts = ['webgl2', 'webgl', 'experimental-webgl', '2d', 'bitmaprenderer'];
        
        for (const type of contexts) {
            try {
                const ctx = canvas.getContext(type);
                if (ctx) {
                    if (type.includes('webgl')) {
                        return {
                            type: 'webgl',
                            version: type === 'webgl2' ? 2 : 1,
                            info: getWebGLInfo(ctx)
                        };
                    }
                    return { type, version: null, info: null };
                }
            } catch (e) {
                continue;
            }
        }
        
        return { type: 'unknown', version: null, info: null };
    }

    /**
     * Get WebGL context information
     */
    function getWebGLInfo(gl) {
        if (!gl) return null;
        
        const info = {
            version: gl.getParameter(gl.VERSION),
            vendor: gl.getParameter(gl.VENDOR),
            renderer: gl.getParameter(gl.RENDERER),
            shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
        };
        
        // Get debug info if available
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            info.unmaskedVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            info.unmaskedRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
        
        return info;
    }

    /**
     * Detect animation hints from canvas element
     */
    function detectAnimationHints(canvas) {
        const hints = [];
        
        const id = canvas.id?.toLowerCase() || '';
        const className = canvas.className?.toString?.().toLowerCase() || '';
        const parent = canvas.parentElement;
        const parentClass = parent?.className?.toString?.().toLowerCase() || '';
        
        // Check for library-specific indicators
        if (id.includes('three') || className.includes('three') || parentClass.includes('three')) {
            hints.push('Three.js');
        }
        if (id.includes('pixi') || className.includes('pixi') || parentClass.includes('pixi')) {
            hints.push('PixiJS');
        }
        if (id.includes('babylon') || className.includes('babylon') || parentClass.includes('babylon')) {
            hints.push('Babylon.js');
        }
        if (id.includes('p5') || className.includes('p5') || parentClass.includes('p5')) {
            hints.push('p5.js');
        }
        if (id.includes('paper') || className.includes('paper') || parentClass.includes('paper')) {
            hints.push('Paper.js');
        }
        if (id.includes('matter') || className.includes('matter') || parentClass.includes('matter')) {
            hints.push('Matter.js');
        }
        if (id.includes('phaser') || className.includes('phaser') || parentClass.includes('phaser')) {
            hints.push('Phaser');
        }
        if (id.includes('konva') || className.includes('konva') || parentClass.includes('konva')) {
            hints.push('Konva');
        }
        if (id.includes('fabric') || className.includes('fabric') || parentClass.includes('fabric')) {
            hints.push('Fabric.js');
        }
        
        // Check for Lottie
        if (parentClass.includes('lottie') || parent?.querySelector('lottie-player')) {
            hints.push('Lottie');
        }
        
        // Check data attributes
        if (canvas.dataset?.engine) {
            hints.push(`Engine: ${canvas.dataset.engine}`);
        }
        if (canvas.dataset?.animated === 'true') {
            hints.push('data-animated');
        }
        
        return hints;
    }

    // ============================================
    // SNAPSHOT CAPTURE
    // ============================================

    /**
     * Capture multiple snapshots of a canvas over time
     */
    async function captureSnapshots(canvas, options = {}) {
        const {
            count = 5,
            intervalMs = 100,
            quality = 0.8,
            maxDimension = 800,
            format = 'image/jpeg'
        } = options;
        
        const snapshots = [];
        
        for (let i = 0; i < count; i++) {
            try {
                const timestamp = Date.now();
                let dataUrl;
                
                try {
                    // Try to capture directly
                    dataUrl = canvas.toDataURL(format, quality);
                } catch (e) {
                    // Canvas might be tainted, try to work around
                    console.warn('[CanvasCapture] Direct capture failed, canvas may be tainted');
                    dataUrl = null;
                }
                
                if (dataUrl && dataUrl.length > 100) {
                    // Compress if needed
                    if (dataUrl.length > 100000 || 
                        canvas.width > maxDimension || 
                        canvas.height > maxDimension) {
                        dataUrl = await compressImage(dataUrl, quality, maxDimension);
                    }
                    
                    snapshots.push({
                        index: i,
                        timestamp,
                        dataUrl,
                        size: dataUrl.length
                    });
                }
            } catch (e) {
                console.warn('[CanvasCapture] Snapshot failed:', e);
            }
            
            if (i < count - 1) {
                await sleep(intervalMs);
            }
        }
        
        return snapshots;
    }

    /**
     * Compress an image data URL
     */
    async function compressImage(dataUrl, quality = 0.7, maxDim = 800) {
        return new Promise((resolve) => {
            const img = new Image();
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Scale down if needed
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

    /**
     * Sleep utility
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ============================================
    // ANIMATION ANALYSIS
    // ============================================

    /**
     * Analyze snapshots to detect animation patterns
     */
    function analyzeAnimationPatterns(snapshots) {
        if (!snapshots || snapshots.length < 2) {
            return {
                isAnimated: false,
                patterns: [],
                confidence: 0,
                estimatedFps: null
            };
        }
        
        const analysis = {
            isAnimated: false,
            patterns: [],
            confidence: 0,
            estimatedFps: null,
            frameDeltas: []
        };
        
        // Calculate time deltas between frames
        for (let i = 1; i < snapshots.length; i++) {
            const delta = snapshots[i].timestamp - snapshots[i - 1].timestamp;
            analysis.frameDeltas.push(delta);
        }
        
        // Estimate FPS from capture interval
        const avgDelta = analysis.frameDeltas.reduce((a, b) => a + b, 0) / analysis.frameDeltas.length;
        analysis.estimatedFps = Math.round(1000 / avgDelta);
        
        // Compare snapshots to detect changes
        // Note: This is a heuristic based on data URL length changes
        // which can indicate visual changes
        const sizeDiffs = [];
        for (let i = 1; i < snapshots.length; i++) {
            const diff = Math.abs(snapshots[i].size - snapshots[i - 1].size);
            const percentDiff = diff / snapshots[i - 1].size;
            sizeDiffs.push(percentDiff);
        }
        
        // If sizes vary significantly, animation is likely
        const avgSizeDiff = sizeDiffs.reduce((a, b) => a + b, 0) / sizeDiffs.length;
        
        if (avgSizeDiff > 0.01) { // More than 1% average difference
            analysis.isAnimated = true;
            analysis.confidence = Math.min(avgSizeDiff * 100, 100);
            analysis.patterns.push('content-change');
        }
        
        // Check for consistent changes (might indicate rotation, pulsing, etc.)
        const isConsistent = sizeDiffs.every(d => d > 0.001);
        if (isConsistent && sizeDiffs.length >= 3) {
            analysis.patterns.push('continuous-animation');
            analysis.confidence = Math.max(analysis.confidence, 70);
        }
        
        return analysis;
    }

    /**
     * Compare two canvas images pixel by pixel (expensive but accurate)
     * Returns change percentage and detected motion regions
     */
    async function compareCanvasFrames(dataUrl1, dataUrl2, sampleRate = 10) {
        return new Promise((resolve) => {
            const img1 = new Image();
            const img2 = new Image();
            let loaded = 0;
            
            const onLoad = () => {
                loaded++;
                if (loaded < 2) return;
                
                const canvas = document.createElement('canvas');
                const width = Math.min(img1.width, img2.width, 200); // Limit for performance
                const height = Math.min(img1.height, img2.height, 200);
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                
                // Draw and get pixels from image 1
                ctx.drawImage(img1, 0, 0, width, height);
                const data1 = ctx.getImageData(0, 0, width, height).data;
                
                // Draw and get pixels from image 2
                ctx.drawImage(img2, 0, 0, width, height);
                const data2 = ctx.getImageData(0, 0, width, height).data;
                
                // Compare pixels (sample for performance)
                let changedPixels = 0;
                let totalSampled = 0;
                
                for (let i = 0; i < data1.length; i += 4 * sampleRate) {
                    const r1 = data1[i], g1 = data1[i+1], b1 = data1[i+2];
                    const r2 = data2[i], g2 = data2[i+1], b2 = data2[i+2];
                    
                    const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
                    if (diff > 30) { // Threshold for "changed"
                        changedPixels++;
                    }
                    totalSampled++;
                }
                
                resolve({
                    changePercent: (changedPixels / totalSampled) * 100,
                    changedPixels,
                    totalSampled
                });
            };
            
            img1.onload = onLoad;
            img2.onload = onLoad;
            img1.onerror = () => resolve({ changePercent: 0, error: true });
            img2.onerror = () => resolve({ changePercent: 0, error: true });
            
            img1.src = dataUrl1;
            img2.src = dataUrl2;
        });
    }

    // ============================================
    // CODE GENERATION
    // ============================================

    /**
     * Generate canvas animation code based on captured data
     */
    function generateCanvasCode(captureData) {
        const lines = [];
        const contextType = captureData.contextType?.type || '2d';
        const isWebGL = contextType === 'webgl';
        
        lines.push('// ============================================');
        lines.push('// Canvas Animation Setup');
        lines.push('// Generated by Design Copier Extension');
        lines.push(`// Context Type: ${contextType}`);
        if (captureData.animationHints?.length > 0) {
            lines.push(`// Detected Libraries: ${captureData.animationHints.join(', ')}`);
        }
        lines.push('// ============================================');
        lines.push('');
        
        if (isWebGL) {
            lines.push(...generateWebGLCode(captureData));
        } else {
            lines.push(...generate2DCode(captureData));
        }
        
        return lines.join('\n');
    }

    /**
     * Generate 2D canvas animation code
     */
    function generate2DCode(captureData) {
        const lines = [];
        const width = captureData.dimensions?.width || 800;
        const height = captureData.dimensions?.height || 600;
        
        lines.push('// Canvas setup');
        lines.push('const canvas = document.createElement("canvas");');
        lines.push(`canvas.width = ${width};`);
        lines.push(`canvas.height = ${height};`);
        lines.push('document.body.appendChild(canvas);');
        lines.push('');
        lines.push('const ctx = canvas.getContext("2d");');
        lines.push('');
        
        lines.push('// Animation state');
        lines.push('let animationFrame = 0;');
        lines.push('let lastTime = 0;');
        lines.push('');
        
        lines.push('// Animation parameters');
        lines.push('const params = {');
        lines.push('    rotation: 0,');
        lines.push('    scale: 1,');
        lines.push('    x: canvas.width / 2,');
        lines.push('    y: canvas.height / 2');
        lines.push('};');
        lines.push('');
        
        lines.push('// Draw function');
        lines.push('function draw() {');
        lines.push('    // Clear canvas');
        lines.push('    ctx.clearRect(0, 0, canvas.width, canvas.height);');
        lines.push('    ');
        lines.push('    // Save context state');
        lines.push('    ctx.save();');
        lines.push('    ');
        lines.push('    // Apply transforms');
        lines.push('    ctx.translate(params.x, params.y);');
        lines.push('    ctx.rotate(params.rotation);');
        lines.push('    ctx.scale(params.scale, params.scale);');
        lines.push('    ');
        lines.push('    // Draw your shapes here');
        lines.push('    // Example: rotating rectangle');
        lines.push('    ctx.fillStyle = "#6b8f71";');
        lines.push('    ctx.fillRect(-50, -50, 100, 100);');
        lines.push('    ');
        lines.push('    // Restore context state');
        lines.push('    ctx.restore();');
        lines.push('}');
        lines.push('');
        
        lines.push('// Animation loop');
        lines.push('function animate(currentTime) {');
        lines.push('    // Calculate delta time');
        lines.push('    const deltaTime = currentTime - lastTime;');
        lines.push('    lastTime = currentTime;');
        lines.push('    ');
        lines.push('    // Update animation state');
        lines.push('    params.rotation += 0.02; // Rotation speed');
        lines.push('    ');
        lines.push('    // Draw frame');
        lines.push('    draw();');
        lines.push('    ');
        lines.push('    // Request next frame');
        lines.push('    animationFrame = requestAnimationFrame(animate);');
        lines.push('}');
        lines.push('');
        
        lines.push('// Start animation');
        lines.push('animate(0);');
        lines.push('');
        
        lines.push('// Stop animation (call when needed)');
        lines.push('// cancelAnimationFrame(animationFrame);');
        
        return lines;
    }

    /**
     * Generate WebGL canvas animation code
     */
    function generateWebGLCode(captureData) {
        const lines = [];
        const width = captureData.dimensions?.width || 800;
        const height = captureData.dimensions?.height || 600;
        
        lines.push('// Note: For complex WebGL animations, consider using Three.js');
        lines.push('// This is a basic WebGL setup');
        lines.push('');
        lines.push('// Canvas setup');
        lines.push('const canvas = document.createElement("canvas");');
        lines.push(`canvas.width = ${width};`);
        lines.push(`canvas.height = ${height};`);
        lines.push('document.body.appendChild(canvas);');
        lines.push('');
        
        lines.push('// Get WebGL context');
        lines.push('const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");');
        lines.push('if (!gl) {');
        lines.push('    console.error("WebGL not supported");');
        lines.push('}');
        lines.push('');
        
        lines.push('// Vertex shader');
        lines.push('const vertexShaderSource = `');
        lines.push('    attribute vec4 aPosition;');
        lines.push('    uniform mat4 uMatrix;');
        lines.push('    void main() {');
        lines.push('        gl_Position = uMatrix * aPosition;');
        lines.push('    }');
        lines.push('`;');
        lines.push('');
        
        lines.push('// Fragment shader');
        lines.push('const fragmentShaderSource = `');
        lines.push('    precision mediump float;');
        lines.push('    uniform vec4 uColor;');
        lines.push('    void main() {');
        lines.push('        gl_FragColor = uColor;');
        lines.push('    }');
        lines.push('`;');
        lines.push('');
        
        lines.push('// Compile shader helper');
        lines.push('function compileShader(gl, type, source) {');
        lines.push('    const shader = gl.createShader(type);');
        lines.push('    gl.shaderSource(shader, source);');
        lines.push('    gl.compileShader(shader);');
        lines.push('    return shader;');
        lines.push('}');
        lines.push('');
        
        lines.push('// Create program');
        lines.push('const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);');
        lines.push('const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);');
        lines.push('');
        lines.push('const program = gl.createProgram();');
        lines.push('gl.attachShader(program, vertexShader);');
        lines.push('gl.attachShader(program, fragmentShader);');
        lines.push('gl.linkProgram(program);');
        lines.push('gl.useProgram(program);');
        lines.push('');
        
        lines.push('// Get attribute/uniform locations');
        lines.push('const positionLocation = gl.getAttribLocation(program, "aPosition");');
        lines.push('const matrixLocation = gl.getUniformLocation(program, "uMatrix");');
        lines.push('const colorLocation = gl.getUniformLocation(program, "uColor");');
        lines.push('');
        
        lines.push('// Create geometry (triangle)');
        lines.push('const positions = new Float32Array([');
        lines.push('    0.0,  0.5,');
        lines.push('   -0.5, -0.5,');
        lines.push('    0.5, -0.5');
        lines.push(']);');
        lines.push('');
        
        lines.push('const positionBuffer = gl.createBuffer();');
        lines.push('gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);');
        lines.push('gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);');
        lines.push('gl.enableVertexAttribArray(positionLocation);');
        lines.push('gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);');
        lines.push('');
        
        lines.push('// Animation state');
        lines.push('let rotation = 0;');
        lines.push('');
        
        lines.push('// Simple 2D rotation matrix');
        lines.push('function getRotationMatrix(angle) {');
        lines.push('    const c = Math.cos(angle);');
        lines.push('    const s = Math.sin(angle);');
        lines.push('    return new Float32Array([');
        lines.push('        c, s, 0, 0,');
        lines.push('       -s, c, 0, 0,');
        lines.push('        0, 0, 1, 0,');
        lines.push('        0, 0, 0, 1');
        lines.push('    ]);');
        lines.push('}');
        lines.push('');
        
        lines.push('// Animation loop');
        lines.push('function animate() {');
        lines.push('    // Clear');
        lines.push('    gl.clearColor(0.1, 0.1, 0.1, 1.0);');
        lines.push('    gl.clear(gl.COLOR_BUFFER_BIT);');
        lines.push('    ');
        lines.push('    // Update rotation');
        lines.push('    rotation += 0.02;');
        lines.push('    ');
        lines.push('    // Set uniforms');
        lines.push('    gl.uniformMatrix4fv(matrixLocation, false, getRotationMatrix(rotation));');
        lines.push('    gl.uniform4f(colorLocation, 0.42, 0.56, 0.44, 1.0); // #6b8f71');
        lines.push('    ');
        lines.push('    // Draw');
        lines.push('    gl.drawArrays(gl.TRIANGLES, 0, 3);');
        lines.push('    ');
        lines.push('    requestAnimationFrame(animate);');
        lines.push('}');
        lines.push('');
        
        lines.push('animate();');
        
        return lines;
    }

    /**
     * Generate library-specific suggestions based on detected hints
     */
    function generateLibrarySuggestions(hints) {
        const suggestions = [];
        
        if (hints.includes('Three.js')) {
            suggestions.push({
                library: 'Three.js',
                code: `// Use Three.js for 3D graphics
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Add objects and animate...`
            });
        }
        
        if (hints.includes('PixiJS')) {
            suggestions.push({
                library: 'PixiJS',
                code: `// Use PixiJS for 2D graphics
import * as PIXI from 'pixi.js';

const app = new PIXI.Application({
    width: 800,
    height: 600,
    backgroundColor: 0x1a1a1a
});
document.body.appendChild(app.view);

// Create sprites and animate...`
            });
        }
        
        if (hints.includes('p5.js')) {
            suggestions.push({
                library: 'p5.js',
                code: `// Use p5.js for creative coding
function setup() {
    createCanvas(800, 600);
}

function draw() {
    background(26);
    // Draw your shapes...
}`
            });
        }
        
        if (hints.includes('Lottie')) {
            suggestions.push({
                library: 'Lottie',
                code: `// Use Lottie for After Effects animations
import lottie from 'lottie-web';

const animation = lottie.loadAnimation({
    container: document.getElementById('lottie-container'),
    renderer: 'svg', // or 'canvas', 'html'
    loop: true,
    autoplay: true,
    path: 'animation.json' // Your animation file
});`
            });
        }
        
        return suggestions;
    }

    // ============================================
    // MAIN CAPTURE FUNCTION
    // ============================================

    /**
     * Capture canvas animation data
     */
    async function captureCanvasAnimation(targetElement = null, options = {}) {
        const {
            snapshotCount = 5,
            snapshotInterval = 100,
            analyzePixels = false
        } = options;
        
        const result = {
            canvases: [],
            animationAnalysis: null,
            generatedCode: null,
            librarySuggestions: [],
            notes: []
        };
        
        // Find canvas elements
        const canvases = findCanvasElements(targetElement || document);
        
        if (canvases.length === 0) {
            result.notes.push('No canvas elements found');
            return result;
        }
        
        // Process each canvas
        for (const canvasInfo of canvases) {
            const captureData = {
                ...canvasInfo,
                snapshots: [],
                analysis: null
            };
            
            try {
                // Capture snapshots
                captureData.snapshots = await captureSnapshots(
                    canvasInfo.element,
                    {
                        count: snapshotCount,
                        intervalMs: snapshotInterval
                    }
                );
                
                // Analyze animation patterns
                captureData.analysis = analyzeAnimationPatterns(captureData.snapshots);
                
                // Optionally do pixel comparison
                if (analyzePixels && captureData.snapshots.length >= 2) {
                    const comparison = await compareCanvasFrames(
                        captureData.snapshots[0].dataUrl,
                        captureData.snapshots[captureData.snapshots.length - 1].dataUrl
                    );
                    captureData.analysis.pixelComparison = comparison;
                    
                    if (comparison.changePercent > 5) {
                        captureData.analysis.isAnimated = true;
                        captureData.analysis.patterns.push('pixel-change');
                    }
                }
                
            } catch (e) {
                console.warn('[CanvasCapture] Capture failed:', e);
                captureData.error = e.message;
            }
            
            result.canvases.push(captureData);
        }
        
        // Generate code for the first canvas
        if (result.canvases.length > 0) {
            const primaryCanvas = result.canvases[0];
            result.generatedCode = generateCanvasCode(primaryCanvas);
            result.librarySuggestions = generateLibrarySuggestions(
                primaryCanvas.animationHints || []
            );
        }
        
        // Aggregate analysis
        result.animationAnalysis = {
            totalCanvases: result.canvases.length,
            animatedCanvases: result.canvases.filter(c => c.analysis?.isAnimated).length,
            detectedLibraries: [...new Set(
                result.canvases.flatMap(c => c.animationHints || [])
            )]
        };
        
        return result;
    }

    // ============================================
    // EXPORTS
    // ============================================

    window.CanvasAnimationCapture = {
        // Main capture
        captureCanvasAnimation,
        
        // Detection
        findCanvasElements,
        detectContextType,
        detectAnimationHints,
        
        // Snapshots
        captureSnapshots,
        compressImage,
        
        // Analysis
        analyzeAnimationPatterns,
        compareCanvasFrames,
        
        // Code generation
        generateCanvasCode,
        generate2DCode,
        generateWebGLCode,
        generateLibrarySuggestions,
        
        // Utilities
        getWebGLInfo
    };

    console.log('[CanvasAnimationCapture] Module loaded - v1.0');
})();

