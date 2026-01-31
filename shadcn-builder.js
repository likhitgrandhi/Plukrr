// ============================================
// shadcn Component Builder
// Orchestrates the flow: detect → fetch → AI compose
// ============================================

// ============================================
// MAIN BUILD FUNCTION
// ============================================

/**
 * Build a shadcn component from design data
 * @param {Object} designData - Extracted design data from content script
 * @param {Object} options - Build options
 * @returns {Promise<Object>} Build result
 */
async function buildShadcnComponent(designData, options = {}) {
    console.log('[ShadcnBuilder] Starting build...');
    
    const style = options.style || 'default'; // 'default' or 'new-york'
    
    try {
        // Step 1: Detect required components from design
        console.log('[ShadcnBuilder] Step 1: Detecting components...');
        const detectedComponents = window.ComponentDetector
            ? window.ComponentDetector.detectRequiredComponents(designData.tree)
            : ['card', 'button']; // Fallback defaults
        
        console.log('[ShadcnBuilder] Detected:', detectedComponents);
        
        if (detectedComponents.length === 0) {
            // If nothing detected, default to card + button (most common)
            detectedComponents.push('card', 'button');
        }
        
        // Step 2: Fetch components from shadcn registry
        console.log('[ShadcnBuilder] Step 2: Fetching from registry...');
        let fetchedComponents = {};
        
        if (window.ShadcnFetcher) {
            try {
                fetchedComponents = await window.ShadcnFetcher.fetchComponentsWithDependencies(
                    detectedComponents,
                    style
                );
                
                // Transform to include code
                const transformedComponents = {};
                for (const [name, data] of Object.entries(fetchedComponents)) {
                    transformedComponents[name] = {
                        code: window.ShadcnFetcher.getComponentCode(data),
                        dependencies: window.ShadcnFetcher.getComponentDependencies(data),
                        registryDependencies: window.ShadcnFetcher.getRegistryDependencies(data)
                    };
                }
                fetchedComponents = transformedComponents;
                
                console.log('[ShadcnBuilder] Fetched components:', Object.keys(fetchedComponents));
            } catch (fetchError) {
                console.warn('[ShadcnBuilder] Fetch failed, continuing with AI only:', fetchError);
            }
        }
        
        // Step 3: Extract design tokens
        console.log('[ShadcnBuilder] Step 3: Extracting design tokens...');
        const designTokens = window.DesignAnalyzer
            ? window.DesignAnalyzer.extractDesignTokens(designData)
            : extractBasicTokens(designData);
        
        // Step 4: Prepare data for AI
        const aiData = {
            designTree: designData.tree,
            designTokens: {
                colors: designTokens.colors || [],
                fonts: Array.from(designTokens.typo?.families || []),
                fontSizes: Array.from(designTokens.typo?.sizes || []),
                spacing: designTokens.spacing || [],
                radii: designTokens.radii || [],
                shadows: designTokens.shadows || []
            },
            fetchedComponents,
            detectedComponents
        };
        
        // Step 5: Call Gemini to compose the component
        console.log('[ShadcnBuilder] Step 4: Calling Gemini AI...');
        
        if (!window.GeminiService) {
            throw new Error('GeminiService not available');
        }
        
        // Check if API key is available
        const status = await window.GeminiService.getServiceStatus();
        if (!status.hasApiKey || !status.isValid) {
            throw new Error('GEMINI_API_KEY_REQUIRED');
        }
        
        // Build the prompt using the intent
        const prompt = buildShadcnPrompt(aiData);
        
        // Call the API
        const response = await window.GeminiService.callGeminiAPI(prompt, {
            temperature: 0.3,
            maxTokens: 4000
        });
        
        console.log('[ShadcnBuilder] Got AI response, parsing...');
        
        // Step 6: Parse the response
        const result = parseAIResponse(response);
        
        if (!result.success) {
            return {
                success: false,
                error: result.error || 'Failed to parse AI response',
                rawResponse: response,
                detectedComponents,
                fetchedComponents: Object.keys(fetchedComponents)
            };
        }
        
        // Step 7: Enhance result with metadata
        return {
            success: true,
            componentName: result.componentName || 'GeneratedComponent',
            componentCode: result.componentCode,
            cssVariables: result.cssVariables || '',
            installCommand: result.installCommand || generateInstallCommand(detectedComponents),
            usageExample: result.usageExample || '',
            detectedComponents,
            fetchedComponents: Object.keys(fetchedComponents),
            style
        };
        
    } catch (error) {
        console.error('[ShadcnBuilder] Build failed:', error);
        
        return {
            success: false,
            error: error.message,
            detectedComponents: [],
            fetchedComponents: []
        };
    }
}

// ============================================
// PROMPT BUILDING
// ============================================

/**
 * Build the prompt for Gemini using the shadcn-component intent
 */
function buildShadcnPrompt(aiData) {
    // Use the INTENT_PROMPTS from gemini-service if available
    // This function is called directly in case we need to customize
    
    const { designTree, designTokens, fetchedComponents, detectedComponents } = aiData;
    
    // Build component code context
    const componentContext = Object.entries(fetchedComponents || {})
        .map(([name, comp]) => {
            const code = comp.code || '';
            const deps = comp.dependencies || [];
            return `
### ${name.toUpperCase()} Component (from shadcn/ui)
\`\`\`tsx
${code.slice(0, 2000)}${code.length > 2000 ? '\n// ... truncated' : ''}
\`\`\`
Dependencies: ${deps.join(', ') || 'none'}
`;
        })
        .join('\n');
    
    // Build structure summary
    const structureSummary = buildStructureSummary(designTree, 0, 4);
    
    return `You are a senior React/TypeScript developer specializing in shadcn/ui components.

## TASK
Create a production-ready React component using ONLY the shadcn/ui components provided below.
The component should visually match the extracted design.

## EXTRACTED DESIGN STRUCTURE
\`\`\`
${structureSummary}
\`\`\`

## DESIGN TOKENS
- Colors: ${(designTokens.colors || []).slice(0, 8).join(', ') || 'not extracted'}
- Fonts: ${(designTokens.fonts || []).join(', ') || 'system'}
- Font Sizes: ${(designTokens.fontSizes || []).join(', ') || 'default'}
- Spacing: ${(designTokens.spacing || []).slice(0, 6).join(', ') || 'default'}
- Border Radius: ${(designTokens.radii || []).join(', ') || 'none'}
- Shadows: ${(designTokens.shadows || []).length > 0 ? designTokens.shadows[0] : 'none'}

## DETECTED COMPONENTS NEEDED
${(detectedComponents || []).join(', ') || 'card, button'}

## AVAILABLE SHADCN COMPONENTS
${componentContext || 'Use standard shadcn component patterns for: ' + (detectedComponents || []).join(', ')}

## REQUIREMENTS
1. Use ONLY shadcn/ui components - compose them to match the design
2. Use Tailwind CSS for custom spacing, colors, and layout
3. Create TypeScript interface for props
4. Make ALL text content configurable via props
5. Include necessary imports from @/components/ui/*
6. Add JSDoc comments

## OUTPUT FORMAT
Return valid JSON:
{
  "componentName": "PascalCaseName",
  "componentCode": "// Full TSX with imports and interface",
  "cssVariables": "/* CSS vars for globals.css if needed */",
  "installCommand": "npx shadcn@latest add ...",
  "usageExample": "<Component prop=\\"value\\" />"
}

Output ONLY JSON, no markdown blocks.`;
}

// ============================================
// RESPONSE PARSING
// ============================================

/**
 * Parse the AI response into structured data
 */
function parseAIResponse(response) {
    if (!response) {
        return { success: false, error: 'Empty response' };
    }
    
    // Try to extract JSON from the response
    let jsonStr = response.trim();
    
    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1];
    }
    
    // Try to find JSON object boundaries
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonStr = jsonStr.slice(startIdx, endIdx + 1);
    }
    
    try {
        const parsed = JSON.parse(jsonStr);
        
        // Validate required fields
        if (!parsed.componentCode) {
            return { 
                success: false, 
                error: 'Response missing componentCode',
                partial: parsed
            };
        }
        
        return {
            success: true,
            componentName: parsed.componentName || 'GeneratedComponent',
            componentCode: parsed.componentCode,
            cssVariables: parsed.cssVariables || '',
            installCommand: parsed.installCommand || '',
            usageExample: parsed.usageExample || ''
        };
    } catch (parseError) {
        console.error('[ShadcnBuilder] JSON parse error:', parseError);
        
        // Try to extract code block as fallback
        const codeMatch = response.match(/```(?:tsx?|jsx?)\s*([\s\S]*?)\s*```/);
        if (codeMatch) {
            return {
                success: true,
                componentName: 'GeneratedComponent',
                componentCode: codeMatch[1],
                cssVariables: '',
                installCommand: '',
                usageExample: ''
            };
        }
        
        return { 
            success: false, 
            error: `JSON parse failed: ${parseError.message}`,
            rawResponse: response.slice(0, 500)
        };
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Build a semantic structure summary for the prompt
 */
function buildStructureSummary(node, depth = 0, maxDepth = 4) {
    if (!node || depth > maxDepth) return '';
    
    const indent = '  '.repeat(depth);
    const role = node.role && node.role !== 'element' ? node.role : node.tag;
    
    let line = `${indent}<${role}>`;
    
    if (node.textContent && node.textContent.length < 40) {
        line += ` "${node.textContent.slice(0, 35)}..."`;
    }
    
    const children = node.children || [];
    if (children.length > 0) {
        line += '\n';
        for (const child of children.slice(0, 6)) {
            line += buildStructureSummary(child, depth + 1, maxDepth);
        }
        if (children.length > 6) {
            line += `${indent}  ... ${children.length - 6} more\n`;
        }
        line += `${indent}</${role}>\n`;
    } else {
        line += `</${role}>\n`;
    }
    
    return line;
}

/**
 * Extract basic design tokens (fallback if DesignAnalyzer not available)
 */
function extractBasicTokens(data) {
    const tokens = {
        colors: [],
        typo: { families: new Set(), sizes: new Set() },
        spacing: [],
        radii: [],
        shadows: []
    };
    
    function traverse(node) {
        if (!node) return;
        
        const styles = node.styles || {};
        
        if (styles.color) tokens.colors.push(styles.color);
        if (styles['background-color'] && styles['background-color'] !== 'rgba(0, 0, 0, 0)') {
            tokens.colors.push(styles['background-color']);
        }
        if (styles['font-family']) tokens.typo.families.add(styles['font-family'].split(',')[0].trim());
        if (styles['font-size']) tokens.typo.sizes.add(styles['font-size']);
        if (styles.padding && styles.padding !== '0px') tokens.spacing.push(styles.padding);
        if (styles['border-radius'] && styles['border-radius'] !== '0px') tokens.radii.push(styles['border-radius']);
        if (styles['box-shadow'] && styles['box-shadow'] !== 'none') tokens.shadows.push(styles['box-shadow']);
        
        (node.children || []).forEach(traverse);
    }
    
    traverse(data.tree);
    
    // Deduplicate
    tokens.colors = [...new Set(tokens.colors)];
    tokens.spacing = [...new Set(tokens.spacing)];
    tokens.radii = [...new Set(tokens.radii)];
    tokens.shadows = [...new Set(tokens.shadows)];
    
    return tokens;
}

/**
 * Generate install command from detected components
 */
function generateInstallCommand(components) {
    if (!components || components.length === 0) {
        return 'npx shadcn@latest add card button';
    }
    return `npx shadcn@latest add ${components.join(' ')}`;
}

// ============================================
// QUICK BUILD (without fetching)
// ============================================

/**
 * Quick build using only AI, without fetching from registry
 * Useful when network is unavailable or for faster builds
 */
async function quickBuildShadcnComponent(designData) {
    console.log('[ShadcnBuilder] Quick build (no registry fetch)...');
    
    const detectedComponents = window.ComponentDetector
        ? window.ComponentDetector.detectRequiredComponents(designData.tree)
        : ['card', 'button'];
    
    const designTokens = window.DesignAnalyzer
        ? window.DesignAnalyzer.extractDesignTokens(designData)
        : extractBasicTokens(designData);
    
    const aiData = {
        designTree: designData.tree,
        designTokens: {
            colors: designTokens.colors || [],
            fonts: Array.from(designTokens.typo?.families || []),
            fontSizes: Array.from(designTokens.typo?.sizes || []),
            spacing: designTokens.spacing || [],
            radii: designTokens.radii || [],
            shadows: designTokens.shadows || []
        },
        fetchedComponents: {}, // Empty - AI will use its knowledge
        detectedComponents
    };
    
    if (!window.GeminiService) {
        throw new Error('GeminiService not available');
    }
    
    const prompt = buildShadcnPrompt(aiData);
    const response = await window.GeminiService.callGeminiAPI(prompt, {
        temperature: 0.3,
        maxTokens: 4000
    });
    
    const result = parseAIResponse(response);
    
    return {
        ...result,
        detectedComponents,
        fetchedComponents: [],
        quickBuild: true
    };
}

// ============================================
// EXPORTS
// ============================================

window.ShadcnBuilder = {
    // Main build function
    buildShadcnComponent,
    quickBuildShadcnComponent,
    
    // Utilities
    buildShadcnPrompt,
    parseAIResponse,
    generateInstallCommand,
    extractBasicTokens
};

console.log('[ShadcnBuilder] Module loaded');


