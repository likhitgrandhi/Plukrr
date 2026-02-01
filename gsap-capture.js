// ============================================
// GSAP Capture Module v1.0
// Detects GSAP timelines/tweens and generates replication code
// ============================================

(function() {
    'use strict';

    // ============================================
    // GSAP DETECTION
    // ============================================

    /**
     * Check if GSAP is available on the page
     */
    function isGsapAvailable() {
        return typeof window.gsap !== 'undefined' ||
               typeof window.TweenMax !== 'undefined' ||
               typeof window.TweenLite !== 'undefined';
    }

    /**
     * Get the GSAP instance (supports different versions)
     */
    function getGsap() {
        return window.gsap || window.TweenMax || window.TweenLite || null;
    }

    /**
     * Get GSAP version info
     */
    function getGsapVersion() {
        if (window.gsap?.version) return { version: window.gsap.version, type: 'gsap3' };
        if (window.TweenMax?.version) return { version: window.TweenMax.version, type: 'gsap2-max' };
        if (window.TweenLite?.version) return { version: window.TweenLite.version, type: 'gsap2-lite' };
        return null;
    }

    /**
     * Detect GSAP plugins
     */
    function detectGsapPlugins() {
        const plugins = [];
        
        const pluginChecks = {
            ScrollTrigger: () => window.ScrollTrigger,
            ScrollSmoother: () => window.ScrollSmoother,
            Draggable: () => window.Draggable,
            MotionPathPlugin: () => window.gsap?.plugins?.motionPath || window.MotionPathPlugin,
            MorphSVGPlugin: () => window.gsap?.plugins?.morphSVG || window.MorphSVGPlugin,
            DrawSVGPlugin: () => window.gsap?.plugins?.drawSVG || window.DrawSVGPlugin,
            SplitText: () => window.SplitText,
            TextPlugin: () => window.gsap?.plugins?.text || window.TextPlugin,
            ScrambleTextPlugin: () => window.gsap?.plugins?.scrambleText || window.ScrambleTextPlugin,
            Physics2DPlugin: () => window.gsap?.plugins?.physics2D || window.Physics2DPlugin,
            PhysicsPropsPlugin: () => window.gsap?.plugins?.physicsProps || window.PhysicsPropsPlugin,
            InertiaPlugin: () => window.InertiaPlugin,
            Flip: () => window.Flip,
            Observer: () => window.Observer,
            CustomEase: () => window.CustomEase,
            CustomWiggle: () => window.CustomWiggle,
            GSDevTools: () => window.GSDevTools,
            EasePack: () => window.EasePack || window.gsap?.parseEase?.('expoScale'),
            CSSRulePlugin: () => window.CSSRulePlugin,
            AttrPlugin: () => window.gsap?.plugins?.attr,
            ModifiersPlugin: () => window.gsap?.plugins?.modifiers
        };
        
        for (const [name, check] of Object.entries(pluginChecks)) {
            try {
                if (check()) {
                    plugins.push({
                        name,
                        available: true,
                        version: check()?.version || null
                    });
                }
            } catch (e) {
                // Plugin check failed
            }
        }
        
        return plugins;
    }

    // ============================================
    // TIMELINE & TWEEN DETECTION
    // ============================================

    /**
     * Find GSAP timelines on the page
     * GSAP 3 stores global timelines differently than GSAP 2
     */
    function findTimelines() {
        const timelines = [];
        const gsap = getGsap();
        
        if (!gsap) return timelines;
        
        // GSAP 3: Check globalTimeline
        if (gsap.globalTimeline) {
            const globalTl = gsap.globalTimeline;
            const children = globalTl.getChildren ? globalTl.getChildren(false, false, true) : [];
            
            for (const child of children) {
                if (isTimeline(child)) {
                    timelines.push(extractTimelineData(child));
                }
            }
        }
        
        // Try common global names
        const commonNames = [
            'tl', 'timeline', 'mainTimeline', 'masterTimeline',
            'introTimeline', 'animTimeline', 'gsapTimeline'
        ];
        
        for (const name of commonNames) {
            const obj = window[name];
            if (obj && isTimeline(obj)) {
                const exists = timelines.some(t => t.id === obj.id);
                if (!exists) {
                    timelines.push(extractTimelineData(obj));
                }
            }
        }
        
        // Check for timelines in common app objects
        const appNames = ['app', 'animation', 'animations', 'anim'];
        for (const appName of appNames) {
            const app = window[appName];
            if (app && typeof app === 'object') {
                for (const key of Object.keys(app)) {
                    if (isTimeline(app[key])) {
                        const exists = timelines.some(t => t.id === app[key].id);
                        if (!exists) {
                            timelines.push(extractTimelineData(app[key]));
                        }
                    }
                }
            }
        }
        
        return timelines;
    }

    /**
     * Check if an object is a GSAP timeline
     */
    function isTimeline(obj) {
        if (!obj) return false;
        
        // GSAP 3
        if (obj.constructor?.name === 'Timeline' || obj.constructor?.name === 'gsap.core.Timeline') {
            return true;
        }
        
        // GSAP 2
        if (obj instanceof (window.TimelineMax || function(){}) ||
            obj instanceof (window.TimelineLite || function(){})) {
            return true;
        }
        
        // Duck typing
        return typeof obj.to === 'function' && 
               typeof obj.from === 'function' && 
               typeof obj.getChildren === 'function';
    }

    /**
     * Check if an object is a GSAP tween
     */
    function isTween(obj) {
        if (!obj) return false;
        
        // GSAP 3
        if (obj.constructor?.name === 'Tween' || obj.constructor?.name === 'gsap.core.Tween') {
            return true;
        }
        
        // GSAP 2
        if (obj instanceof (window.TweenMax || function(){}) ||
            obj instanceof (window.TweenLite || function(){})) {
            return true;
        }
        
        // Duck typing
        return typeof obj.targets === 'function' && 
               typeof obj.progress === 'function' &&
               !isTimeline(obj);
    }

    /**
     * Extract data from a timeline
     */
    function extractTimelineData(timeline, depth = 0) {
        if (!timeline || depth > 5) return null;
        
        const data = {
            type: 'timeline',
            id: timeline.id || null,
            duration: timeline.duration?.() || timeline._dur || 0,
            totalDuration: timeline.totalDuration?.() || timeline._tDur || 0,
            progress: timeline.progress?.() || 0,
            totalProgress: timeline.totalProgress?.() || 0,
            time: timeline.time?.() || timeline._time || 0,
            paused: timeline.paused?.() || timeline._ps || false,
            reversed: timeline.reversed?.() || timeline._rts < 0 || false,
            timeScale: timeline.timeScale?.() || timeline._ts || 1,
            repeat: timeline.repeat?.() || timeline._repeat || 0,
            repeatDelay: timeline.repeatDelay?.() || timeline._rDelay || 0,
            yoyo: timeline.yoyo?.() || timeline._yoyo || false,
            labels: {},
            children: []
        };
        
        // Extract labels
        if (timeline.labels) {
            data.labels = { ...timeline.labels };
        } else if (timeline._labels) {
            data.labels = { ...timeline._labels };
        }
        
        // Extract children (tweens and nested timelines)
        const children = timeline.getChildren ? 
            timeline.getChildren(false, true, true) : 
            timeline._first ? collectChildren(timeline._first) : [];
        
        for (const child of children) {
            if (isTimeline(child)) {
                const childData = extractTimelineData(child, depth + 1);
                if (childData) {
                    data.children.push(childData);
                }
            } else if (isTween(child)) {
                const tweenData = extractTweenData(child);
                if (tweenData) {
                    data.children.push(tweenData);
                }
            }
        }
        
        return data;
    }

    /**
     * Collect children from linked list structure (GSAP 3)
     */
    function collectChildren(first) {
        const children = [];
        let current = first;
        while (current) {
            children.push(current);
            current = current._next;
        }
        return children;
    }

    /**
     * Extract data from a tween
     */
    function extractTweenData(tween) {
        if (!tween) return null;
        
        const data = {
            type: 'tween',
            id: tween.id || null,
            duration: tween.duration?.() || tween._dur || 0,
            delay: tween.delay?.() || tween._delay || 0,
            startTime: tween.startTime?.() || tween._start || 0,
            progress: tween.progress?.() || 0,
            paused: tween.paused?.() || tween._ps || false,
            reversed: tween.reversed?.() || false,
            timeScale: tween.timeScale?.() || tween._ts || 1,
            repeat: tween.repeat?.() || tween._repeat || 0,
            repeatDelay: tween.repeatDelay?.() || tween._rDelay || 0,
            yoyo: tween.yoyo?.() || tween._yoyo || false,
            ease: null,
            targets: [],
            vars: {},
            from: null,
            to: null
        };
        
        // Extract ease
        if (tween.vars?.ease) {
            data.ease = typeof tween.vars.ease === 'string' ? 
                tween.vars.ease : 
                tween.vars.ease?.name || 'power1.out';
        } else if (tween._ease) {
            data.ease = tween._ease?.name || tween._ease?.id || 'power1.out';
        }
        
        // Extract targets
        const targets = tween.targets?.() || tween._targets || [];
        for (const target of targets) {
            if (target instanceof Element) {
                data.targets.push({
                    type: 'element',
                    selector: getElementSelector(target),
                    tagName: target.tagName?.toLowerCase(),
                    id: target.id || null,
                    className: target.className?.toString?.() || null
                });
            } else if (typeof target === 'object') {
                data.targets.push({
                    type: 'object',
                    keys: Object.keys(target).slice(0, 10) // First 10 keys
                });
            }
        }
        
        // Extract vars (animation properties)
        const vars = tween.vars || {};
        const skipKeys = ['ease', 'onComplete', 'onUpdate', 'onStart', 'onRepeat', 
                         'onReverseComplete', 'callbackScope', 'immediateRender',
                         'lazy', 'overwrite', 'paused', 'reversed', 'yoyo',
                         'repeat', 'repeatDelay', 'delay', 'duration'];
        
        for (const [key, value] of Object.entries(vars)) {
            if (skipKeys.includes(key)) continue;
            if (typeof value === 'function') continue;
            if (key.startsWith('on') && typeof value === 'function') continue;
            
            // Store animatable properties
            data.vars[key] = serializeValue(value);
        }
        
        // Try to get from/to values
        if (tween._pt) {
            data.properties = extractPropertyData(tween._pt);
        }
        
        return data;
    }

    /**
     * Extract property data from GSAP's internal property structure
     */
    function extractPropertyData(pt) {
        const properties = [];
        let current = pt;
        
        while (current) {
            const prop = {
                property: current.p || current.n || 'unknown',
                start: current.s,
                end: current.s + current.c,
                change: current.c,
                unit: current.u || ''
            };
            
            // Only include meaningful properties
            if (prop.property !== 'unknown' && prop.change !== 0) {
                properties.push(prop);
            }
            
            current = current._next;
        }
        
        return properties;
    }

    /**
     * Serialize a value for storage
     */
    function serializeValue(value) {
        if (value === null || value === undefined) return value;
        if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map(serializeValue);
        }
        if (typeof value === 'object') {
            const result = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = serializeValue(v);
            }
            return result;
        }
        return String(value);
    }

    /**
     * Get CSS selector for an element
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

    // ============================================
    // SCROLLTRIGGER DETECTION
    // ============================================

    /**
     * Detect ScrollTrigger instances
     */
    function detectScrollTriggers() {
        const triggers = [];
        
        if (!window.ScrollTrigger) return triggers;
        
        // Get all ScrollTrigger instances
        const allTriggers = window.ScrollTrigger.getAll?.() || [];
        
        for (const trigger of allTriggers) {
            triggers.push(extractScrollTriggerData(trigger));
        }
        
        return triggers;
    }

    /**
     * Extract data from a ScrollTrigger instance
     */
    function extractScrollTriggerData(trigger) {
        if (!trigger) return null;
        
        const data = {
            type: 'scrollTrigger',
            id: trigger.id || null,
            trigger: null,
            start: trigger.start,
            end: trigger.end,
            scroller: null,
            scrub: trigger.scrub,
            pin: trigger.pin ? getElementSelector(trigger.pin) : null,
            pinSpacing: trigger.pinSpacing,
            markers: trigger.markers || false,
            toggleClass: trigger.toggleClass || null,
            toggleActions: trigger.toggleActions || null,
            progress: trigger.progress,
            isActive: trigger.isActive
        };
        
        // Get trigger element
        if (trigger.trigger instanceof Element) {
            data.trigger = getElementSelector(trigger.trigger);
        }
        
        // Get scroller
        if (trigger.scroller && trigger.scroller !== window) {
            data.scroller = trigger.scroller instanceof Element ? 
                getElementSelector(trigger.scroller) : 'window';
        }
        
        return data;
    }

    // ============================================
    // CODE GENERATION
    // ============================================

    /**
     * Generate GSAP code from captured data
     */
    function generateGsapCode(captureData) {
        const lines = [];
        const gsapVersion = captureData.version?.type || 'gsap3';
        const isV3 = gsapVersion === 'gsap3';
        
        lines.push('// ============================================');
        lines.push('// GSAP Animation Setup');
        lines.push('// Generated by Design Copier Extension');
        lines.push(`// GSAP Version: ${captureData.version?.version || 'unknown'}`);
        lines.push('// ============================================');
        lines.push('');
        
        // Imports
        if (isV3) {
            lines.push('import gsap from "gsap";');
            
            // Add plugin imports
            const pluginImports = [];
            for (const plugin of captureData.plugins || []) {
                if (['ScrollTrigger', 'Draggable', 'Flip', 'Observer'].includes(plugin.name)) {
                    pluginImports.push(`import { ${plugin.name} } from "gsap/${plugin.name}";`);
                }
            }
            if (pluginImports.length > 0) {
                lines.push(...pluginImports);
                lines.push('');
                lines.push('// Register plugins');
                for (const plugin of captureData.plugins || []) {
                    if (['ScrollTrigger', 'Draggable', 'Flip', 'Observer'].includes(plugin.name)) {
                        lines.push(`gsap.registerPlugin(${plugin.name});`);
                    }
                }
            }
        } else {
            lines.push('// Include GSAP via CDN or npm');
            lines.push('// <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>');
        }
        lines.push('');
        
        // Generate timelines
        for (let i = 0; i < (captureData.timelines || []).length; i++) {
            const timeline = captureData.timelines[i];
            lines.push(...generateTimelineCode(timeline, `tl${i + 1}`, isV3));
            lines.push('');
        }
        
        // Generate ScrollTriggers
        if (captureData.scrollTriggers && captureData.scrollTriggers.length > 0) {
            lines.push('// ScrollTrigger Animations');
            for (const st of captureData.scrollTriggers) {
                lines.push(...generateScrollTriggerCode(st));
                lines.push('');
            }
        }
        
        // If no timelines found, generate example
        if (!captureData.timelines || captureData.timelines.length === 0) {
            lines.push('// Example GSAP animation');
            lines.push('// Modify selectors and properties as needed');
            lines.push('');
            lines.push('const tl = gsap.timeline({');
            lines.push('    defaults: { ease: "power2.out", duration: 0.8 }');
            lines.push('});');
            lines.push('');
            lines.push('tl.from(".element", {');
            lines.push('    opacity: 0,');
            lines.push('    y: 50');
            lines.push('});');
        }
        
        return lines.join('\n');
    }

    /**
     * Generate code for a timeline
     */
    function generateTimelineCode(timeline, varName, isV3) {
        const lines = [];
        
        // Timeline options
        const options = [];
        if (timeline.repeat && timeline.repeat !== 0) {
            options.push(`repeat: ${timeline.repeat}`);
        }
        if (timeline.repeatDelay) {
            options.push(`repeatDelay: ${timeline.repeatDelay}`);
        }
        if (timeline.yoyo) {
            options.push('yoyo: true');
        }
        if (timeline.paused) {
            options.push('paused: true');
        }
        
        // Create timeline
        if (options.length > 0) {
            lines.push(`const ${varName} = gsap.timeline({`);
            lines.push(`    ${options.join(',\n    ')}`);
            lines.push('});');
        } else {
            lines.push(`const ${varName} = gsap.timeline();`);
        }
        lines.push('');
        
        // Add labels
        for (const [label, time] of Object.entries(timeline.labels || {})) {
            lines.push(`${varName}.addLabel("${label}", ${time});`);
        }
        if (Object.keys(timeline.labels || {}).length > 0) {
            lines.push('');
        }
        
        // Add tweens
        for (const child of timeline.children || []) {
            if (child.type === 'tween') {
                lines.push(...generateTweenCode(child, varName, isV3));
            } else if (child.type === 'timeline') {
                // Nested timeline
                const nestedName = `${varName}_nested`;
                lines.push(...generateTimelineCode(child, nestedName, isV3));
                lines.push(`${varName}.add(${nestedName});`);
            }
        }
        
        return lines;
    }

    /**
     * Generate code for a tween
     */
    function generateTweenCode(tween, timelineVar, isV3) {
        const lines = [];
        
        // Determine method (to, from, fromTo)
        let method = 'to';
        if (tween.from) method = 'from';
        if (tween.from && tween.to) method = 'fromTo';
        
        // Get selector
        const selector = tween.targets?.[0]?.selector || '".element"';
        const selectorStr = selector.startsWith('.') || selector.startsWith('#') ? 
            `"${selector}"` : selector;
        
        // Build vars object
        const vars = { ...tween.vars };
        
        // Add ease if present
        if (tween.ease) {
            vars.ease = tween.ease;
        }
        
        // Add duration if not 0.5 (default)
        if (tween.duration && tween.duration !== 0.5) {
            vars.duration = tween.duration;
        }
        
        // Add delay if present
        if (tween.delay) {
            vars.delay = tween.delay;
        }
        
        // Format vars
        const varsStr = formatVarsObject(vars);
        
        // Build position parameter
        let position = '';
        if (tween.startTime && tween.startTime > 0) {
            position = `, ${tween.startTime}`;
        }
        
        // Generate code
        if (timelineVar) {
            lines.push(`${timelineVar}.${method}(${selectorStr}, ${varsStr}${position});`);
        } else {
            lines.push(`gsap.${method}(${selectorStr}, ${varsStr});`);
        }
        
        return lines;
    }

    /**
     * Generate ScrollTrigger code
     */
    function generateScrollTriggerCode(st) {
        const lines = [];
        
        const trigger = st.trigger || '".trigger-element"';
        const triggerStr = trigger.startsWith('.') || trigger.startsWith('#') ? 
            `"${trigger}"` : trigger;
        
        lines.push(`gsap.to(${triggerStr}, {`);
        lines.push('    // Animation properties');
        lines.push('    opacity: 1,');
        lines.push('    y: 0,');
        lines.push('    scrollTrigger: {');
        lines.push(`        trigger: ${triggerStr},`);
        
        if (st.start) {
            lines.push(`        start: "${st.start}",`);
        } else {
            lines.push('        start: "top 80%",');
        }
        
        if (st.end) {
            lines.push(`        end: "${st.end}",`);
        }
        
        if (st.scrub !== undefined && st.scrub !== false) {
            lines.push(`        scrub: ${st.scrub === true ? 'true' : st.scrub},`);
        }
        
        if (st.pin) {
            lines.push(`        pin: "${st.pin}",`);
        }
        
        if (st.toggleActions) {
            lines.push(`        toggleActions: "${st.toggleActions}",`);
        }
        
        if (st.markers) {
            lines.push('        markers: true, // Remove in production');
        }
        
        lines.push('    }');
        lines.push('});');
        
        return lines;
    }

    /**
     * Format vars object as code string
     */
    function formatVarsObject(vars, indent = '    ') {
        const entries = Object.entries(vars);
        if (entries.length === 0) return '{}';
        
        const lines = ['{'];
        for (const [key, value] of entries) {
            const valueStr = typeof value === 'string' ? `"${value}"` : 
                            typeof value === 'object' ? JSON.stringify(value) : value;
            lines.push(`${indent}${key}: ${valueStr},`);
        }
        lines.push('}');
        
        return lines.join('\n');
    }

    // ============================================
    // MAIN CAPTURE FUNCTION
    // ============================================

    /**
     * Capture all GSAP animation data
     */
    async function captureGsap(targetElement = null) {
        const result = {
            isGsapAvailable: isGsapAvailable(),
            version: getGsapVersion(),
            plugins: [],
            timelines: [],
            scrollTriggers: [],
            generatedCode: null,
            notes: []
        };
        
        if (!result.isGsapAvailable) {
            result.notes.push('GSAP not detected on this page');
            return result;
        }
        
        // Detect plugins
        result.plugins = detectGsapPlugins();
        
        // Find timelines
        result.timelines = findTimelines();
        
        // Detect ScrollTriggers
        result.scrollTriggers = detectScrollTriggers();
        
        // Add notes
        if (result.timelines.length === 0) {
            result.notes.push('No accessible GSAP timelines found - they may be scoped locally');
        }
        
        if (result.plugins.some(p => p.name === 'ScrollTrigger') && result.scrollTriggers.length === 0) {
            result.notes.push('ScrollTrigger plugin detected but no triggers found');
        }
        
        // Generate code
        result.generatedCode = generateGsapCode(result);
        
        return result;
    }

    /**
     * Detect GSAP animations on a specific element
     */
    function detectElementGsapAnimations(el) {
        if (!isGsapAvailable()) return [];
        
        const gsap = getGsap();
        const animations = [];
        
        // GSAP 3: getTweensOf
        if (gsap.getTweensOf) {
            const tweens = gsap.getTweensOf(el);
            for (const tween of tweens) {
                animations.push(extractTweenData(tween));
            }
        }
        
        // Check if element is a ScrollTrigger trigger
        if (window.ScrollTrigger?.getAll) {
            const triggers = window.ScrollTrigger.getAll();
            for (const trigger of triggers) {
                if (trigger.trigger === el || trigger.pin === el) {
                    animations.push(extractScrollTriggerData(trigger));
                }
            }
        }
        
        return animations;
    }

    // ============================================
    // EXPORTS
    // ============================================

    window.GSAPCapture = {
        // Main capture
        captureGsap,
        
        // Detection
        isGsapAvailable,
        getGsap,
        getGsapVersion,
        detectGsapPlugins,
        
        // Timeline/Tween extraction
        findTimelines,
        isTimeline,
        isTween,
        extractTimelineData,
        extractTweenData,
        
        // ScrollTrigger
        detectScrollTriggers,
        extractScrollTriggerData,
        
        // Element-specific
        detectElementGsapAnimations,
        
        // Code generation
        generateGsapCode,
        generateTimelineCode,
        generateTweenCode,
        generateScrollTriggerCode
    };

    console.log('[GSAPCapture] Module loaded - v1.0');
})();

