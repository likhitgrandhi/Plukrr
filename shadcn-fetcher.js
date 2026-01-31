// ============================================
// shadcn Registry Fetcher
// Fetches components from shadcn's public registry API at runtime
// ============================================

const SHADCN_REGISTRY_BASE = 'https://ui.shadcn.com/registry';
const CACHE_PREFIX = 'shadcn_cache_';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// ============================================
// CACHE MANAGEMENT
// ============================================

async function getCached(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get([CACHE_PREFIX + key], (result) => {
            const cached = result[CACHE_PREFIX + key];
            if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_DURATION)) {
                console.log(`[ShadcnFetcher] Cache hit for: ${key}`);
                resolve(cached.data);
            } else {
                resolve(null);
            }
        });
    });
}

async function setCache(key, data) {
    return new Promise((resolve) => {
        const cacheEntry = {
            data: data,
            timestamp: Date.now()
        };
        chrome.storage.local.set({ [CACHE_PREFIX + key]: cacheEntry }, resolve);
    });
}

async function clearCache() {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (items) => {
            const keysToRemove = Object.keys(items).filter(k => k.startsWith(CACHE_PREFIX));
            chrome.storage.local.remove(keysToRemove, resolve);
        });
    });
}

// ============================================
// REGISTRY API
// ============================================

/**
 * Fetch the component index (list of all available components)
 * @returns {Promise<Array>} List of component metadata
 */
async function fetchComponentIndex() {
    const cached = await getCached('index');
    if (cached) return cached;
    
    console.log('[ShadcnFetcher] Fetching component index from registry...');
    
    try {
        const response = await fetch(`${SHADCN_REGISTRY_BASE}/index.json`);
        
        if (!response.ok) {
            throw new Error(`Registry returned ${response.status}`);
        }
        
        const data = await response.json();
        await setCache('index', data);
        
        console.log(`[ShadcnFetcher] Fetched index with ${data.length} components`);
        return data;
    } catch (error) {
        console.error('[ShadcnFetcher] Failed to fetch index:', error);
        throw error;
    }
}

/**
 * Fetch specific component(s) by name
 * @param {string[]} componentNames - Array of component names to fetch
 * @param {string} style - Style variant ('default' or 'new-york')
 * @returns {Promise<Object>} Map of component name to component data
 */
async function fetchComponents(componentNames, style = 'default') {
    const results = {};
    const fetchPromises = [];
    
    console.log(`[ShadcnFetcher] Fetching components: ${componentNames.join(', ')}`);
    
    for (const name of componentNames) {
        const cacheKey = `${style}-${name}`;
        
        fetchPromises.push(
            (async () => {
                // Check cache first
                const cached = await getCached(cacheKey);
                if (cached) {
                    results[name] = cached;
                    return;
                }
                
                // Fetch from registry
                try {
                    const response = await fetch(
                        `${SHADCN_REGISTRY_BASE}/styles/${style}/${name}.json`
                    );
                    
                    if (response.ok) {
                        const data = await response.json();
                        await setCache(cacheKey, data);
                        results[name] = data;
                        console.log(`[ShadcnFetcher] Fetched: ${name}`);
                    } else {
                        console.warn(`[ShadcnFetcher] Component not found: ${name}`);
                    }
                } catch (error) {
                    console.error(`[ShadcnFetcher] Error fetching ${name}:`, error);
                }
            })()
        );
    }
    
    await Promise.all(fetchPromises);
    return results;
}

/**
 * Fetch a single component by name
 * @param {string} componentName - Component name
 * @param {string} style - Style variant
 * @returns {Promise<Object|null>} Component data or null
 */
async function fetchComponent(componentName, style = 'default') {
    const results = await fetchComponents([componentName], style);
    return results[componentName] || null;
}

// ============================================
// COMPONENT DATA EXTRACTION
// ============================================

/**
 * Get the actual component source code from component data
 * @param {Object} componentData - Component data from registry
 * @returns {string} Combined source code
 */
function getComponentCode(componentData) {
    if (!componentData || !componentData.files) {
        return '';
    }
    
    return componentData.files
        .filter(f => f.type === 'registry:ui' || f.path?.endsWith('.tsx'))
        .map(f => f.content)
        .join('\n\n');
}

/**
 * Get component dependencies (npm packages)
 * @param {Object} componentData - Component data from registry
 * @returns {string[]} List of dependencies
 */
function getComponentDependencies(componentData) {
    if (!componentData) return [];
    
    return [
        ...(componentData.dependencies || []),
        ...(componentData.devDependencies || [])
    ];
}

/**
 * Get registry dependencies (other shadcn components this one needs)
 * @param {Object} componentData - Component data from registry
 * @returns {string[]} List of required shadcn components
 */
function getRegistryDependencies(componentData) {
    if (!componentData) return [];
    return componentData.registryDependencies || [];
}

/**
 * Fetch a component and all its registry dependencies
 * @param {string[]} componentNames - Initial components to fetch
 * @param {string} style - Style variant
 * @returns {Promise<Object>} Map of all components (including dependencies)
 */
async function fetchComponentsWithDependencies(componentNames, style = 'default') {
    const allComponents = {};
    const toFetch = [...componentNames];
    const fetched = new Set();
    
    while (toFetch.length > 0) {
        const name = toFetch.pop();
        
        if (fetched.has(name)) continue;
        fetched.add(name);
        
        const component = await fetchComponent(name, style);
        if (component) {
            allComponents[name] = component;
            
            // Add registry dependencies to fetch queue
            const deps = getRegistryDependencies(component);
            for (const dep of deps) {
                if (!fetched.has(dep)) {
                    toFetch.push(dep);
                }
            }
        }
    }
    
    return allComponents;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get list of all available component names from index
 * @returns {Promise<string[]>} List of component names
 */
async function getAvailableComponents() {
    const index = await fetchComponentIndex();
    return index
        .filter(item => item.type === 'registry:ui')
        .map(item => item.name);
}

/**
 * Check if a component exists in the registry
 * @param {string} name - Component name to check
 * @returns {Promise<boolean>}
 */
async function componentExists(name) {
    const available = await getAvailableComponents();
    return available.includes(name);
}

/**
 * Get component metadata from index
 * @param {string} name - Component name
 * @returns {Promise<Object|null>} Component metadata
 */
async function getComponentMetadata(name) {
    const index = await fetchComponentIndex();
    return index.find(item => item.name === name) || null;
}

/**
 * Generate install command for components
 * @param {string[]} componentNames - Components to install
 * @returns {string} npx command
 */
function generateInstallCommand(componentNames) {
    if (componentNames.length === 0) return '';
    return `npx shadcn@latest add ${componentNames.join(' ')}`;
}

// ============================================
// EXPORTS
// ============================================

window.ShadcnFetcher = {
    // Core fetching
    fetchComponentIndex,
    fetchComponents,
    fetchComponent,
    fetchComponentsWithDependencies,
    
    // Data extraction
    getComponentCode,
    getComponentDependencies,
    getRegistryDependencies,
    
    // Utilities
    getAvailableComponents,
    componentExists,
    getComponentMetadata,
    generateInstallCommand,
    
    // Cache management
    clearCache,
    
    // Constants
    REGISTRY_BASE: SHADCN_REGISTRY_BASE,
    CACHE_DURATION
};

console.log('[ShadcnFetcher] Module loaded');


