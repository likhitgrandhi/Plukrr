// ============================================
// Animation Detector v1.0
// Detects CSS animations, JS libraries, WebGL, and Web Animations API
// ============================================

(function() {
    'use strict';

    // ============================================
    // LIBRARY DETECTION SIGNATURES
    // ============================================

    const ANIMATION_LIBRARIES = {
        threejs: {
            name: 'Three.js',
            globals: ['THREE'],
            indicators: [
                'WebGLRenderer',
                'Scene',
                'PerspectiveCamera',
                'OrthographicCamera',
                'Mesh',
                'BufferGeometry'
            ],
            canvasClass: ['threejs', 'three-js', 'webgl'],
            version: () => window.THREE?.REVISION || null
        },
        gsap: {
            name: 'GSAP',
            globals: ['gsap', 'TweenMax', 'TweenLite', 'TimelineMax', 'TimelineLite'],
            indicators: ['gsap', 'tween', 'timeline'],
            version: () => window.gsap?.version || null
        },
        framerMotion: {
            name: 'Framer Motion',
            globals: ['framer', '__framer_importFromPackage'],
            indicators: ['motion', 'AnimatePresence', 'useAnimation'],
            reactProps: ['data-framer-component-type', 'data-framer-name'],
            version: () => null // Framer Motion doesn't expose version easily
        },
        animejs: {
            name: 'Anime.js',
            globals: ['anime'],
            indicators: ['anime', 'animejs'],
            version: () => window.anime?.version || null
        },
        lottie: {
            name: 'Lottie',
            globals: ['lottie', 'bodymovin'],
            indicators: ['lottie-player', 'bodymovin'],
            elements: ['lottie-player'],
            version: () => window.lottie?.version || window.bodymovin?.version || null
        },
        aframe: {
            name: 'A-Frame',
            globals: ['AFRAME'],
            elements: ['a-scene', 'a-entity', 'a-box', 'a-sphere', 'a-cylinder'],
            version: () => window.AFRAME?.version || null
        },
        velocity: {
            name: 'Velocity.js',
            globals: ['Velocity'],
            indicators: ['velocity'],
            version: () => window.Velocity?.version || null
        },
        popmotion: {
            name: 'Popmotion',
            globals: ['popmotion'],
            indicators: ['popmotion', 'pose'],
            version: () => null
        },
        motionOne: {
            name: 'Motion One',
            globals: ['Motion'],
            indicators: ['@motionone', 'motion-one'],
            version: () => null
        },
        scrollTrigger: {
            name: 'ScrollTrigger (GSAP)',
            globals: ['ScrollTrigger'],
            indicators: ['scrolltrigger', 'scroll-trigger'],
            version: () => window.ScrollTrigger?.version || null
        },
        scrollMagic: {
            name: 'ScrollMagic',
            globals: ['ScrollMagic'],
            indicators: ['scrollmagic', 'scroll-magic'],
            version: () => window.ScrollMagic?.version || null
        },
        locomotive: {
            name: 'Locomotive Scroll',
            globals: ['LocomotiveScroll'],
            indicators: ['locomotive', 'data-scroll'],
            dataAttributes: ['data-scroll', 'data-scroll-container'],
            version: () => null
        },
        rellax: {
            name: 'Rellax',
            globals: ['Rellax'],
            indicators: ['rellax'],
            version: () => null
        },
        aos: {
            name: 'AOS (Animate On Scroll)',
            globals: ['AOS'],
            dataAttributes: ['data-aos', 'data-aos-duration'],
            version: () => window.AOS?.version || null
        },
        barba: {
            name: 'Barba.js',
            globals: ['barba'],
            dataAttributes: ['data-barba', 'data-barba-namespace'],
            version: () => window.barba?.version || null
        },
        pixijs: {
            name: 'PixiJS',
            globals: ['PIXI'],
            indicators: ['pixi', 'pixijs'],
            version: () => window.PIXI?.VERSION || null
        },
        babylonjs: {
            name: 'Babylon.js',
            globals: ['BABYLON'],
            indicators: ['babylon', 'babylonjs'],
            version: () => window.BABYLON?.Engine?.Version || null
        },
        p5: {
            name: 'p5.js',
            globals: ['p5'],
            indicators: ['p5', 'processing'],
            version: () => window.p5?.VERSION || null
        },
        matter: {
            name: 'Matter.js',
            globals: ['Matter'],
            indicators: ['matter', 'matterjs'],
            version: () => window.Matter?.version || null
        },
        paperjs: {
            name: 'Paper.js',
            globals: ['paper'],
            indicators: ['paper', 'paperjs'],
            version: () => window.paper?.version || null
        },
        d3: {
            name: 'D3.js',
            globals: ['d3'],
            indicators: ['d3', 'd3js'],
            version: () => window.d3?.version || null
        },
        svgjs: {
            name: 'SVG.js',
            globals: ['SVG'],
            indicators: ['svgjs', 'svg.js'],
            version: () => window.SVG?.version || null
        },
        vivus: {
            name: 'Vivus',
            globals: ['Vivus'],
            indicators: ['vivus'],
            version: () => null
        },
        typed: {
            name: 'Typed.js',
            globals: ['Typed'],
            indicators: ['typed', 'typedjs'],
            version: () => null
        },
        splitting: {
            name: 'Splitting.js',
            globals: ['Splitting'],
            dataAttributes: ['data-splitting'],
            version: () => null
        }
    };

    // ============================================
    // ANIMATION TYPE DETECTION
    // ============================================

    /**
     * Detect all animation libraries present on the page
     */
    function detectAnimationLibraries() {
        const detected = [];

        for (const [key, lib] of Object.entries(ANIMATION_LIBRARIES)) {
            const result = {
                id: key,
                name: lib.name,
                detected: false,
                version: null,
                confidence: 0,
                indicators: []
            };

            // Check globals
            if (lib.globals) {
                for (const global of lib.globals) {
                    if (typeof window[global] !== 'undefined') {
                        result.detected = true;
                        result.confidence += 3;
                        result.indicators.push(`window.${global} exists`);
                    }
                }
            }

            // Check for elements
            if (lib.elements) {
                for (const el of lib.elements) {
                    if (document.querySelector(el)) {
                        result.detected = true;
                        result.confidence += 2;
                        result.indicators.push(`<${el}> element found`);
                    }
                }
            }

            // Check for data attributes
            if (lib.dataAttributes) {
                for (const attr of lib.dataAttributes) {
                    if (document.querySelector(`[${attr}]`)) {
                        result.detected = true;
                        result.confidence += 2;
                        result.indicators.push(`[${attr}] attribute found`);
                    }
                }
            }

            // Check React props for Framer Motion
            if (lib.reactProps) {
                for (const prop of lib.reactProps) {
                    if (document.querySelector(`[${prop}]`)) {
                        result.detected = true;
                        result.confidence += 2;
                        result.indicators.push(`[${prop}] React prop found`);
                    }
                }
            }

            // Get version if available
            if (result.detected && lib.version) {
                try {
                    result.version = lib.version();
                } catch (e) {
                    // Version detection failed
                }
            }

            if (result.detected) {
                detected.push(result);
            }
        }

        return detected;
    }

    /**
     * Detect CSS animations on an element and its children
     */
    function detectCSSAnimations(el) {
        const animations = [];
        
        function scanElement(element) {
            if (!element || element.nodeType !== 1) return;
            
            const styles = window.getComputedStyle(element);
            
            // Check for CSS animation
            const animationName = styles.animationName;
            const animationDuration = styles.animationDuration;
            const animationTimingFunction = styles.animationTimingFunction;
            const animationDelay = styles.animationDelay;
            const animationIterationCount = styles.animationIterationCount;
            const animationDirection = styles.animationDirection;
            const animationFillMode = styles.animationFillMode;
            const animationPlayState = styles.animationPlayState;
            
            if (animationName && animationName !== 'none') {
                animations.push({
                    type: 'css-animation',
                    element: getElementSelector(element),
                    animationName,
                    duration: animationDuration,
                    timingFunction: animationTimingFunction,
                    delay: animationDelay,
                    iterationCount: animationIterationCount,
                    direction: animationDirection,
                    fillMode: animationFillMode,
                    playState: animationPlayState
                });
            }
            
            // Check for CSS transitions
            const transition = styles.transition;
            const transitionProperty = styles.transitionProperty;
            const transitionDuration = styles.transitionDuration;
            
            if (transitionProperty && transitionProperty !== 'none' && 
                transitionDuration && transitionDuration !== '0s') {
                animations.push({
                    type: 'css-transition',
                    element: getElementSelector(element),
                    transition,
                    property: transitionProperty,
                    duration: transitionDuration,
                    timingFunction: styles.transitionTimingFunction,
                    delay: styles.transitionDelay
                });
            }
            
            // Recurse into children
            for (const child of element.children) {
                scanElement(child);
            }
        }
        
        scanElement(el);
        return animations;
    }

    /**
     * Detect Web Animations API usage on an element
     */
    function detectWebAnimations(el) {
        const webAnimations = [];
        
        function scanElement(element) {
            if (!element || element.nodeType !== 1) return;
            
            try {
                // Get all animations on the element
                const elementAnimations = element.getAnimations?.() || [];
                
                for (const anim of elementAnimations) {
                    const effect = anim.effect;
                    const timing = effect?.getTiming?.() || anim.effect?.timing || {};
                    const keyframes = effect?.getKeyframes?.() || [];
                    
                    webAnimations.push({
                        type: 'web-animation',
                        element: getElementSelector(element),
                        id: anim.id || null,
                        playState: anim.playState,
                        currentTime: anim.currentTime,
                        timeline: anim.timeline?.constructor?.name || 'DocumentTimeline',
                        timing: {
                            duration: timing.duration,
                            delay: timing.delay,
                            endDelay: timing.endDelay,
                            fill: timing.fill,
                            iterations: timing.iterations,
                            direction: timing.direction,
                            easing: timing.easing
                        },
                        keyframes: keyframes.map(kf => {
                            const frame = { ...kf };
                            delete frame.composite;
                            delete frame.computedOffset;
                            return frame;
                        })
                    });
                }
            } catch (e) {
                // getAnimations not supported or failed
            }
            
            // Recurse into children
            for (const child of element.children) {
                scanElement(child);
            }
        }
        
        scanElement(el);
        return webAnimations;
    }

    /**
     * Detect canvas elements and their context types
     */
    function detectCanvasAnimations(el) {
        const canvasAnimations = [];
        const canvasElements = el.tagName === 'CANVAS' 
            ? [el] 
            : Array.from(el.querySelectorAll('canvas'));
        
        for (const canvas of canvasElements) {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            
            const info = {
                type: 'canvas',
                element: getElementSelector(canvas),
                dimensions: {
                    width: canvas.width,
                    height: canvas.height,
                    displayWidth: rect.width,
                    displayHeight: rect.height
                },
                contextType: null,
                isWebGL: false,
                isAnimated: false,
                animationHints: []
            };
            
            // Try to detect context type
            try {
                // Check for WebGL
                const gl = canvas.getContext('webgl2') || 
                           canvas.getContext('webgl') || 
                           canvas.getContext('experimental-webgl');
                if (gl) {
                    info.contextType = gl.getParameter ? 
                        (gl.getParameter(gl.VERSION) || 'WebGL') : 'WebGL';
                    info.isWebGL = true;
                    
                    // Try to get WebGL info
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    if (debugInfo) {
                        info.renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                        info.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                    }
                }
            } catch (e) {
                // WebGL context not available
            }
            
            if (!info.contextType) {
                try {
                    const ctx2d = canvas.getContext('2d');
                    if (ctx2d) {
                        info.contextType = '2d';
                    }
                } catch (e) {
                    // 2D context not available
                }
            }
            
            // Check for animation indicators
            const classes = canvas.className?.toString?.() || '';
            const id = canvas.id || '';
            
            // Three.js indicators
            if (classes.includes('three') || id.includes('three') ||
                classes.includes('webgl') || id.includes('webgl')) {
                info.animationHints.push('Three.js likely');
            }
            
            // Check if canvas has animation frame loop (heuristic)
            if (canvas.dataset?.animated || canvas.dataset?.fps) {
                info.isAnimated = true;
                info.animationHints.push('data-animated attribute');
            }
            
            // Check parent for animation library hints
            const parent = canvas.parentElement;
            if (parent) {
                const parentClasses = parent.className?.toString?.() || '';
                if (parentClasses.includes('lottie')) {
                    info.animationHints.push('Lottie container');
                }
                if (parentClasses.includes('pixi')) {
                    info.animationHints.push('PixiJS container');
                }
            }
            
            canvasAnimations.push(info);
        }
        
        return canvasAnimations;
    }

    /**
     * Detect SVG animations
     */
    function detectSVGAnimations(el) {
        const svgAnimations = [];
        const svgElements = el.tagName === 'SVG' || el.tagName === 'svg'
            ? [el]
            : Array.from(el.querySelectorAll('svg'));
        
        for (const svg of svgElements) {
            const rect = svg.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            
            const info = {
                type: 'svg',
                element: getElementSelector(svg),
                dimensions: {
                    width: rect.width,
                    height: rect.height,
                    viewBox: svg.getAttribute('viewBox')
                },
                hasAnimations: false,
                animationElements: [],
                cssAnimated: false
            };
            
            // Check for SMIL animations
            const animateElements = svg.querySelectorAll('animate, animateTransform, animateMotion, set');
            if (animateElements.length > 0) {
                info.hasAnimations = true;
                for (const anim of animateElements) {
                    info.animationElements.push({
                        tagName: anim.tagName.toLowerCase(),
                        attributeName: anim.getAttribute('attributeName'),
                        from: anim.getAttribute('from'),
                        to: anim.getAttribute('to'),
                        dur: anim.getAttribute('dur'),
                        repeatCount: anim.getAttribute('repeatCount'),
                        fill: anim.getAttribute('fill')
                    });
                }
            }
            
            // Check for CSS animations on SVG elements
            const allSvgElements = svg.querySelectorAll('*');
            for (const svgEl of allSvgElements) {
                const styles = window.getComputedStyle(svgEl);
                if (styles.animationName && styles.animationName !== 'none') {
                    info.cssAnimated = true;
                    info.hasAnimations = true;
                    break;
                }
            }
            
            if (info.hasAnimations) {
                svgAnimations.push(info);
            }
        }
        
        return svgAnimations;
    }

    /**
     * Detect scroll-based animations
     */
    function detectScrollAnimations(el) {
        const scrollAnimations = [];
        
        // Check for AOS
        const aosElements = el.querySelectorAll('[data-aos]');
        for (const aosEl of aosElements) {
            scrollAnimations.push({
                type: 'aos',
                element: getElementSelector(aosEl),
                animation: aosEl.dataset.aos,
                duration: aosEl.dataset.aosDuration,
                delay: aosEl.dataset.aosDelay,
                easing: aosEl.dataset.aosEasing,
                once: aosEl.dataset.aosOnce,
                offset: aosEl.dataset.aosOffset
            });
        }
        
        // Check for Locomotive Scroll
        const locomotiveElements = el.querySelectorAll('[data-scroll]');
        for (const locEl of locomotiveElements) {
            scrollAnimations.push({
                type: 'locomotive',
                element: getElementSelector(locEl),
                scroll: locEl.dataset.scroll,
                scrollSpeed: locEl.dataset.scrollSpeed,
                scrollDirection: locEl.dataset.scrollDirection,
                scrollDelay: locEl.dataset.scrollDelay
            });
        }
        
        // Check for ScrollTrigger markers
        const scrollTriggerElements = el.querySelectorAll('[data-gsap-scroll], .gsap-marker-start, .gsap-marker-end');
        for (const stEl of scrollTriggerElements) {
            scrollAnimations.push({
                type: 'scrolltrigger',
                element: getElementSelector(stEl),
                detected: true
            });
        }
        
        // Check for Splitting.js
        const splittingElements = el.querySelectorAll('[data-splitting]');
        for (const splitEl of splittingElements) {
            scrollAnimations.push({
                type: 'splitting',
                element: getElementSelector(splitEl),
                splitting: splitEl.dataset.splitting || 'chars'
            });
        }
        
        return scrollAnimations;
    }

    /**
     * Detect transform animations by checking for non-identity transforms
     */
    function detectTransformAnimations(el) {
        const transforms = [];
        
        function scanElement(element) {
            if (!element || element.nodeType !== 1) return;
            
            const styles = window.getComputedStyle(element);
            const transform = styles.transform;
            const transformOrigin = styles.transformOrigin;
            const perspective = styles.perspective;
            const transformStyle = styles.transformStyle;
            
            if (transform && transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)') {
                transforms.push({
                    element: getElementSelector(element),
                    transform,
                    transformOrigin,
                    perspective: perspective !== 'none' ? perspective : null,
                    transformStyle: transformStyle !== 'flat' ? transformStyle : null,
                    willChange: styles.willChange,
                    is3D: transform.includes('3d') || transform.includes('Z') ||
                          transformStyle === 'preserve-3d' || perspective !== 'none'
                });
            }
            
            // Recurse into children
            for (const child of element.children) {
                scanElement(child);
            }
        }
        
        scanElement(el);
        return transforms;
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Get a CSS selector for an element
     */
    function getElementSelector(el) {
        if (!el) return '';
        if (el.id) return `#${el.id}`;
        
        const tag = el.tagName?.toLowerCase() || 'unknown';
        const classes = Array.from(el.classList || [])
            .filter(c => !c.includes('ai-design-copier'))
            .slice(0, 3)
            .map(c => `.${c}`)
            .join('');
        
        return `${tag}${classes}`;
    }

    /**
     * Check if an element or its children have active animations
     */
    function hasActiveAnimations(el) {
        if (!el) return false;
        
        // Check CSS animations
        const styles = window.getComputedStyle(el);
        if (styles.animationName && styles.animationName !== 'none' &&
            styles.animationPlayState === 'running') {
            return true;
        }
        
        // Check Web Animations API
        try {
            const animations = el.getAnimations?.() || [];
            if (animations.some(a => a.playState === 'running')) {
                return true;
            }
        } catch (e) {}
        
        // Check children
        for (const child of el.children) {
            if (hasActiveAnimations(child)) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Estimate animation complexity
     */
    function estimateAnimationComplexity(animationData) {
        let score = 0;
        
        // Library complexity
        const libScores = {
            threejs: 5,
            babylonjs: 5,
            pixijs: 4,
            gsap: 3,
            framerMotion: 3,
            animejs: 2,
            lottie: 3,
            d3: 3
        };
        
        for (const lib of animationData.detectedLibraries || []) {
            score += libScores[lib.id] || 1;
        }
        
        // Animation count
        score += (animationData.cssAnimations?.length || 0) * 0.5;
        score += (animationData.webAnimations?.length || 0) * 1;
        score += (animationData.canvasAnimations?.length || 0) * 3;
        score += (animationData.svgAnimations?.length || 0) * 1;
        score += (animationData.scrollAnimations?.length || 0) * 0.5;
        
        // Categorize
        if (score >= 10) return 'complex';
        if (score >= 5) return 'moderate';
        if (score >= 1) return 'simple';
        return 'none';
    }

    // ============================================
    // MAIN DETECTION FUNCTION
    // ============================================

    /**
     * Detect all animations for an element and its children
     */
    function detectAllAnimations(el) {
        if (!el) {
            return {
                hasAnimations: false,
                animationTypes: [],
                detectedLibraries: [],
                complexity: 'none'
            };
        }

        // Detect libraries (page-wide)
        const detectedLibraries = detectAnimationLibraries();
        
        // Detect various animation types
        const cssAnimations = detectCSSAnimations(el);
        const webAnimations = detectWebAnimations(el);
        const canvasAnimations = detectCanvasAnimations(el);
        const svgAnimations = detectSVGAnimations(el);
        const scrollAnimations = detectScrollAnimations(el);
        const transformAnimations = detectTransformAnimations(el);
        
        // Determine animation types present
        const animationTypes = [];
        if (cssAnimations.length > 0) animationTypes.push('css');
        if (webAnimations.length > 0) animationTypes.push('web-animations');
        if (canvasAnimations.length > 0) animationTypes.push('canvas');
        if (canvasAnimations.some(c => c.isWebGL)) animationTypes.push('webgl');
        if (svgAnimations.length > 0) animationTypes.push('svg');
        if (scrollAnimations.length > 0) animationTypes.push('scroll');
        if (transformAnimations.length > 0) animationTypes.push('transform');
        
        // Add library-specific types
        for (const lib of detectedLibraries) {
            if (!animationTypes.includes(lib.id)) {
                animationTypes.push(lib.id);
            }
        }
        
        const hasAnimations = animationTypes.length > 0;
        
        const animationData = {
            hasAnimations,
            animationTypes,
            detectedLibraries,
            cssAnimations,
            webAnimations,
            canvasAnimations,
            svgAnimations,
            scrollAnimations,
            transformAnimations,
            metadata: {
                elementHasActiveAnimations: hasActiveAnimations(el),
                timestamp: Date.now()
            }
        };
        
        animationData.complexity = estimateAnimationComplexity(animationData);
        
        return animationData;
    }

    // ============================================
    // EXPORTS
    // ============================================

    window.AnimationDetector = {
        // Main detection
        detectAllAnimations,
        
        // Individual detectors
        detectAnimationLibraries,
        detectCSSAnimations,
        detectWebAnimations,
        detectCanvasAnimations,
        detectSVGAnimations,
        detectScrollAnimations,
        detectTransformAnimations,
        
        // Utilities
        hasActiveAnimations,
        estimateAnimationComplexity,
        getElementSelector,
        
        // Constants
        ANIMATION_LIBRARIES
    };

    console.log('[AnimationDetector] Module loaded - v1.0');
})();

