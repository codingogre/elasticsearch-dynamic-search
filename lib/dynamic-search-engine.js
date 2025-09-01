/**
 * DynamicSearchEngine - Main orchestrator for P&G's dynamic hybrid search
 * Coordinates all search components to provide intelligent search results
 */

const QueryAnalyzer = require('./query-analyzer');
const ContextualWeighter = require('./contextual-weighter');
const QueryEnhancer = require('./query-enhancer');
const WeightCombiner = require('./weight-combiner');
const QueryBuilder = require('./query-builder');
const PerformanceMonitor = require('./performance-monitor');

class DynamicSearchEngine {
  constructor(esClient, queryTemplates, options = {}) {
    this.esClient = esClient;
    
    // Configuration
    this.options = {
      indexName: 'pg-search-*',
      enablePerformanceMonitoring: true,
      enableQueryEnhancement: true,
      enableContextualWeighting: true,
      cacheResults: false,
      cacheTTL: 300000, // 5 minutes
      ...options
    };

    // Category mapping (must be provided by client)
    this.categoryMapping = options.categoryMapping || {};

    // Initialize components
    this.queryAnalyzer = new QueryAnalyzer();
    this.contextualWeighter = new ContextualWeighter(esClient, options.contextualWeighter);
    this.queryEnhancer = new QueryEnhancer(options.queryEnhancer);
    this.weightCombiner = new WeightCombiner(options.weightCombiner);
    this.queryBuilder = new QueryBuilder(queryTemplates, options.queryBuilder);
    
    if (this.options.enablePerformanceMonitoring) {
      this.performanceMonitor = new PerformanceMonitor();
    }

    // Cache for results (if enabled)
    this.resultCache = new Map();
    
    // Statistics tracking
    this.stats = {
      totalSearches: 0,
      averageResponseTime: 0,
      strategyCounts: {},
      errorCount: 0
    };
  }

  /**
   * Execute dynamic hybrid search
   * @param {string} query - The search query
   * @param {object} userContext - User context and preferences
   * @returns {Promise<object>} Search results with metadata
   */
  async search(query, userContext = {}) {
    const startTime = Date.now();
    const searchId = this._generateSearchId();
    
    try {
      // Start performance monitoring
      let monitor;
      if (this.performanceMonitor) {
        monitor = this.performanceMonitor.startSearch(searchId);
      }

      // Validate input
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Query is required and must be a non-empty string');
      }

      const cleanQuery = query.trim();
      
      // Check cache if enabled
      const cacheKey = this._getCacheKey(cleanQuery, userContext);
      if (this.options.cacheResults && this.resultCache.has(cacheKey)) {
        const cached = this.resultCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.options.cacheTTL) {
          monitor?.complete();
          return this._formatCachedResult(cached.result, startTime);
        }
        // Remove expired entry
        this.resultCache.delete(cacheKey);
      }

      // Phase 1: Query Analysis
      monitor?.startPhase('query_analysis');
      const queryAnalysis = this.queryAnalyzer.analyzeQuery(cleanQuery, userContext);
      monitor?.endPhase('query_analysis');

      // Phase 2: Query Enhancement (regional, proper nouns, etc.)
      monitor?.startPhase('query_enhancement');
      let queryEnhancement = null;
      if (this.options.enableQueryEnhancement) {
        queryEnhancement = this.queryEnhancer.enhanceQuery(cleanQuery);
      } else {
        queryEnhancement = this._getDefaultEnhancement(cleanQuery);
      }
      monitor?.endPhase('query_enhancement');

      // Phase 3: Contextual Weighting
      monitor?.startPhase('contextual_weighting');
      let contextualWeights = null;
      if (this.options.enableContextualWeighting) {
        contextualWeights = await this.contextualWeighter.calculateContextualWeights(
          cleanQuery, 
          this.options.indexName, 
          userContext
        );
      } else {
        contextualWeights = this._getDefaultContextualWeights();
      }
      monitor?.endPhase('contextual_weighting');

      // Phase 4: Weight Combination
      monitor?.startPhase('weight_combination');
      const finalWeights = this.weightCombiner.combineWeights(
        queryAnalysis,
        contextualWeights,
        queryEnhancement,
        cleanQuery
      );
      monitor?.endPhase('weight_combination');

      // Phase 5: Query Building
      monitor?.startPhase('query_building');
      const esQuery = this.queryBuilder.buildHybridQuery(
        cleanQuery,
        finalWeights,
        userContext.useRerank !== false,
        userContext.inferenceId
      );
      monitor?.endPhase('query_building');

      // Phase 6: Elasticsearch Execution
      monitor?.startPhase('elasticsearch_search');
      
      // Log the final query before execution
      console.log('=== ELASTICSEARCH SINGLE SEARCH ===');
      console.log('Query:', cleanQuery);
      console.log('Index:', this.options.indexName);
      console.log('Use Rerank:', userContext.useRerank !== false);
      console.log('Inference ID:', userContext.inferenceId);
      console.log('Final Weights:', {
        lexical: finalWeights.lexicalWeight,
        semantic: finalWeights.semanticWeight,
        strategy: finalWeights.strategy,
        confidence: finalWeights.confidence
      });
      console.log('Query Body:', JSON.stringify(esQuery, null, 2));
      console.log('==================================');
      
      const searchResponse = await this.esClient.search({
        index: this.options.indexName,
        body: esQuery
      });
      monitor?.endPhase('elasticsearch_search');

      // Phase 7: Result Processing
      monitor?.startPhase('result_processing');
      const processedResults = this._processSearchResults(
        searchResponse,
        finalWeights,
        startTime,
        searchId
      );
      monitor?.endPhase('result_processing');

      // Complete monitoring
      monitor?.complete();

      // Update statistics
      this._updateStats(finalWeights.strategy, Date.now() - startTime);

      // Cache results if enabled
      if (this.options.cacheResults) {
        this.resultCache.set(cacheKey, {
          result: processedResults,
          timestamp: Date.now()
        });
        
        // Clean up cache if it gets too large
        if (this.resultCache.size > 1000) {
          this._cleanupCache();
        }
      }

      return processedResults;

    } catch (error) {
      this.stats.errorCount++;
      
      // Log error details
      console.error('Dynamic Search Engine Error:', {
        searchId,
        query,
        userContext,
        error: error.message,
        stack: error.stack
      });

      throw new Error(`Search failed: ${error.message}`);
    }
  }

  /**
   * Execute dynamic hybrid multisearch with separated bookmarks and other content
   * @param {string} query - The search query
   * @param {object} userContext - User context and preferences
   * @param {object} options - Multisearch options
   * @returns {Promise<object>} Multisearch results with separated bookmarks and other content
   */
  async multisearch(query, userContext = {}, options = {}) {
    const startTime = Date.now();
    const searchId = this._generateSearchId();
    
    try {
      // Start performance monitoring
      let monitor;
      if (this.performanceMonitor) {
        monitor = this.performanceMonitor.startSearch(searchId);
      }

      // Validate input
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Query is required and must be a non-empty string');
      }

      const cleanQuery = query.trim();
      
      // Phase 1-4: Same analysis as regular search to get weights
      monitor?.startPhase('query_analysis');
      const queryAnalysis = this.queryAnalyzer.analyzeQuery(cleanQuery, userContext);
      monitor?.endPhase('query_analysis');

      monitor?.startPhase('query_enhancement');
      let queryEnhancement = null;
      if (this.options.enableQueryEnhancement) {
        queryEnhancement = this.queryEnhancer.enhanceQuery(cleanQuery);
      } else {
        queryEnhancement = this._getDefaultEnhancement(cleanQuery);
      }
      monitor?.endPhase('query_enhancement');

      monitor?.startPhase('contextual_weighting');
      let contextualWeights = null;
      if (this.options.enableContextualWeighting) {
        contextualWeights = await this.contextualWeighter.calculateContextualWeights(
          cleanQuery, 
          this.options.indexName, 
          userContext
        );
      } else {
        contextualWeights = this._getDefaultContextualWeights();
      }
      monitor?.endPhase('contextual_weighting');

      monitor?.startPhase('weight_combination');
      const finalWeights = this.weightCombiner.combineWeights(
        queryAnalysis,
        contextualWeights,
        queryEnhancement,
        cleanQuery
      );
      monitor?.endPhase('weight_combination');

      // Phase 5: Build queries for multisearch using specific templates
      monitor?.startPhase('query_building');
      
      const useRerank = userContext.useRerank !== false;
      
      // Get the query templates from the queryBuilder
      const queryTemplates = this.queryBuilder.queryTemplates;
      
      // Select appropriate templates based on reranking status
      const bookmarkTemplateKey = useRerank ? 'bookmarksRerank' : 'bookmarksNoRerank';
      const regularTemplateKey = useRerank ? 'rerank' : 'noRerank';
      
      const bookmarkTemplate = queryTemplates[bookmarkTemplateKey];
      const regularTemplate = queryTemplates[regularTemplateKey];
      
      // Validate that templates exist
      if (!bookmarkTemplate) {
        throw new Error(`Bookmark template not found: ${bookmarkTemplateKey}`);
      }
      if (!regularTemplate) {
        throw new Error(`Regular template not found: ${regularTemplateKey}`);
      }
      
      // Prepare template substitutions
      const templateVars = {
        query: cleanQuery,
        lexical_weight: finalWeights.lexicalWeight,
        semantic_weight: finalWeights.semanticWeight,
        inference_id: userContext.inferenceId || '.rerank-v1-elasticsearch'
      };

      // Build bookmark query by replacing template variables
      const bookmarkQuery = JSON.parse(bookmarkTemplate
        .replace(/\{\{query\}\}/g, templateVars.query)
        .replace(/\{\{lexical_weight\}\}/g, templateVars.lexical_weight)
        .replace(/\{\{semantic_weight\}\}/g, templateVars.semantic_weight)
        .replace(/\{\{inference_id\}\}/g, templateVars.inference_id));

      // Build regular query by replacing template variables  
      const regularQuery = JSON.parse(regularTemplate
        .replace(/\{\{query\}\}/g, templateVars.query)
        .replace(/\{\{lexical_weight\}\}/g, templateVars.lexical_weight)
        .replace(/\{\{semantic_weight\}\}/g, templateVars.semantic_weight)
        .replace(/\{\{inference_id\}\}/g, templateVars.inference_id));

      monitor?.endPhase('query_building');

      // Phase 6: Execute multisearch
      monitor?.startPhase('elasticsearch_multisearch');
      
      const {
        bookmarkIndex = 'content_bookmarks_rerank',
        otherIndices = 'content-servicenow-4665-rerank,content_mylearning_rerank,content-mysql-4a86-rerank'
      } = options;

      const msearchBody = [
        // Bookmarks search
        { index: bookmarkIndex },
        bookmarkQuery,
        // Regular search (excluding bookmarks)
        { index: otherIndices },
        regularQuery
      ];

      console.log('=== ELASTICSEARCH MULTISEARCH ===');
      console.log('Query:', cleanQuery);
      console.log('Bookmark Index:', bookmarkIndex);
      console.log('Other Indices:', otherIndices);
      console.log('Use Rerank:', useRerank);
      console.log('Inference ID:', userContext.inferenceId);
      console.log('Templates Used:', {
        bookmarks: bookmarkTemplateKey,
        regular: regularTemplateKey
      });
      console.log('Final Weights:', {
        lexical: finalWeights.lexicalWeight,
        semantic: finalWeights.semanticWeight,
        strategy: finalWeights.strategy,
        confidence: finalWeights.confidence,
        reasoning: finalWeights.reasoning
      });
      console.log('Template Variables:', templateVars);
      console.log('Bookmark Query:', JSON.stringify(bookmarkQuery, null, 2));
      console.log('Regular Query:', JSON.stringify(regularQuery, null, 2));
      console.log('Full Multisearch Body:', JSON.stringify(msearchBody, null, 2));
      console.log('================================');

      const response = await this.esClient.msearch({
        body: msearchBody
      });

      monitor?.endPhase('elasticsearch_multisearch');

      // Phase 7: Process multisearch results
      monitor?.startPhase('result_processing');
      const processedResults = this._processMultisearchResults(
        response,
        finalWeights,
        startTime,
        searchId
      );
      monitor?.endPhase('result_processing');

      // Complete monitoring
      monitor?.complete();

      // Update statistics
      this._updateStats(finalWeights.strategy, Date.now() - startTime);

      return processedResults;

    } catch (error) {
      this.stats.errorCount++;
      
      console.error('Dynamic Search Engine Multisearch Error:', {
        searchId,
        query,
        userContext,
        error: error.message,
        stack: error.stack
      });

      throw new Error(`Multisearch failed: ${error.message}`);
    }
  }

  /**
   * Get search statistics
   * @returns {object} Current statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.resultCache.size,
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Clear result cache
   */
  clearCache() {
    this.resultCache.clear();
  }

  /**
   * Update engine configuration
   * @param {object} newOptions - New configuration options
   */
  updateConfig(newOptions) {
    this.options = { ...this.options, ...newOptions };
    
    // Update component configurations
    if (newOptions.queryEnhancer) {
      this.queryEnhancer.updateOptions?.(newOptions.queryEnhancer);
    }
    if (newOptions.weightCombiner) {
      this.weightCombiner.updateOptions?.(newOptions.weightCombiner);
    }
    if (newOptions.queryBuilder) {
      this.queryBuilder.updateOptions?.(newOptions.queryBuilder);
    }
  }

  /**
   * Add custom proper nouns for detection
   * @param {Array<string>} properNouns - Array of proper nouns
   */
  addCustomProperNouns(properNouns) {
    this.queryEnhancer.addKnownProperNouns(properNouns);
  }

  /**
   * Add custom regional patterns
   * @param {string} regionCode - Region code
   * @param {Array<string>} patterns - Patterns for this region
   */
  addRegionalPatterns(regionCode, patterns) {
    this.queryEnhancer.addRegionalPatterns(regionCode, patterns);
  }

  /**
   * Process multisearch results from Elasticsearch
   * @private
   */
  _processMultisearchResults(response, weights, startTime, sessionId) {
    const [bookmarkResults, otherResults] = response.responses;

    // Helper function to extract field values
    const extractFieldValue = (fieldValue) => {
      if (Array.isArray(fieldValue) && fieldValue.length > 0) {
        return fieldValue[0];
      }
      return fieldValue;
    };

    // Process bookmark results
    const processedBookmarks = {
      hits: bookmarkResults.hits?.hits?.map(hit => ({
        id: hit._id,
        index: hit._index,
        score: hit._score,
        source: {
          // Map the fields structure to match what frontend expects
          unified_title: extractFieldValue(hit.fields?.unified_title),
          unified_description: extractFieldValue(hit.fields?.unified_description),
          unified_url: extractFieldValue(hit.fields?.unified_url),
          unified_id: extractFieldValue(hit.fields?.unified_id),
          unified_keywords: extractFieldValue(hit.fields?.unified_keywords),
          unified_author: extractFieldValue(hit.fields?.unified_author),
          all_text: extractFieldValue(hit.fields?.all_text),
          // Also include any _source data
          ...hit._source
        },
        highlight: hit.highlight || {},
        category: 'Bookmarks',
        matched_queries: hit.matched_queries || []
      })) || [],
      total: typeof bookmarkResults.hits?.total === 'object' 
        ? bookmarkResults.hits.total.value 
        : bookmarkResults.hits?.total || 0
    };

    // Process other results
    const processedOther = {
      hits: otherResults.hits?.hits?.map(hit => ({
        id: hit._id,
        index: hit._index,
        score: hit._score,
        source: {
          // Map the fields structure to match what frontend expects
          unified_title: extractFieldValue(hit.fields?.unified_title),
          unified_description: extractFieldValue(hit.fields?.unified_description),
          unified_url: extractFieldValue(hit.fields?.unified_url),
          unified_id: extractFieldValue(hit.fields?.unified_id),
          unified_keywords: extractFieldValue(hit.fields?.unified_keywords),
          unified_author: extractFieldValue(hit.fields?.unified_author),
          all_text: extractFieldValue(hit.fields?.all_text),
          // Also include any _source data
          ...hit._source
        },
        highlight: hit.highlight || {},
        category: this._mapCategory(hit._index, this.categoryMapping),
        sourceLabel: this._mapCategory(hit._index, this.categoryMapping),
        matched_queries: hit.matched_queries || []
      })) || [],
      total: typeof otherResults.hits?.total === 'object' 
        ? otherResults.hits.total.value 
        : otherResults.hits?.total || 0,
      categories: {}
    };

    // Group other results by category for filter functionality
    processedOther.hits.forEach(hit => {
      const category = this._mapCategory(hit.index, this.categoryMapping);
      if (!processedOther.categories[category]) {
        processedOther.categories[category] = [];
      }
      processedOther.categories[category].push(hit);
    });

    return {
      bookmarks: processedBookmarks,
      other: processedOther,
      searchTime: Date.now() - startTime,
      took: Math.max(bookmarkResults.took || 0, otherResults.took || 0),
      sessionId: sessionId,
      queryId: this._generateQueryId(),
      weights: {
        lexicalWeight: weights.lexicalWeight,
        semanticWeight: weights.semanticWeight,
        confidence: weights.confidence,
        strategy: weights.strategy,
        reasoning: weights.reasoning,
        ...(weights.properNouns && { properNouns: weights.properNouns })
      }
    };
  }

  /**
   * Process search results from Elasticsearch
   * @private
   */
  _processSearchResults(response, weights, startTime, sessionId) {
    const took = response.took || 0;
    const total = response.hits?.total?.value || response.hits?.total || 0;
    
    // Process hits - handle both _source and fields responses
    const hits = (response.hits?.hits || []).map((hit, index) => ({
      id: hit._id,
      score: hit._score,
      index: hit._index,
      category: this._mapCategory(hit._index, this.categoryMapping),
      source: hit._source || hit.fields || {},
      matched_queries: hit.matched_queries || [],
      rank: index + 1
    }));

    // Group by categories
    const categories = {};
    hits.forEach(hit => {
      if (!categories[hit.category]) {
        categories[hit.category] = [];
      }
      categories[hit.category].push(hit);
    });

    return {
      hits,
      total,
      categories,
      took,
      searchTime: Date.now() - startTime,
      weights: {
        lexicalWeight: weights.lexicalWeight,
        semanticWeight: weights.semanticWeight,
        confidence: weights.confidence,
        strategy: weights.strategy,
        reasoning: weights.reasoning,
        ...(weights.properNouns && { properNouns: weights.properNouns })
      },
      sessionId: sessionId,
      queryId: this._generateQueryId()
    };
  }

  /**
   * Map index name to category
   * @private
   */
  _mapCategory(indexName, categoryMapping) {
    return categoryMapping[indexName] || indexName;
  }

  /**
   * Generate unique search ID
   * @private
   */
  _generateSearchId() {
    return `search_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate unique query ID
   * @private
   */
  _generateQueryId() {
    return `query_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get cache key for result caching
   * @private
   */
  _getCacheKey(query, userContext) {
    const contextKey = JSON.stringify({
      useRerank: userContext.useRerank,
      domain: userContext.domain,
      intent: userContext.intent
    });
    return `${query}:${contextKey}`;
  }

  /**
   * Format cached result with updated timing
   * @private
   */
  _formatCachedResult(cachedResult, startTime) {
    return {
      ...cachedResult,
      searchTime: Date.now() - startTime,
      cached: true
    };
  }

  /**
   * Get default enhancement for disabled enhancement mode
   * @private
   */
  _getDefaultEnhancement(query) {
    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    return {
      originalQuery: query,
      detectedRegion: null,
      properNouns: { hasProperNouns: false, properNouns: [], confidence: 0 },
      queryStats: { 
        wordCount: words.length, 
        characterCount: query.length, 
        avgWordLength: words.length > 0 ? words.reduce((sum, w) => sum + w.length, 0) / words.length : 0 
      }
    };
  }

  /**
   * Get default contextual weights for disabled contextual weighting
   * @private
   */
  _getDefaultContextualWeights() {
    return {
      lexicalWeight: 0.5,
      semanticWeight: 0.5,
      confidence: 0.6,
      reasoning: ['Default balanced weights - contextual analysis disabled']
    };
  }

  /**
   * Update search statistics
   * @private
   */
  _updateStats(strategy, responseTime) {
    this.stats.totalSearches++;
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (this.stats.totalSearches - 1) + responseTime) / this.stats.totalSearches;
    
    if (!this.stats.strategyCounts[strategy]) {
      this.stats.strategyCounts[strategy] = 0;
    }
    this.stats.strategyCounts[strategy]++;
  }

  /**
   * Clean up old cache entries
   * @private
   */
  _cleanupCache() {
    const now = Date.now();
    const entries = Array.from(this.resultCache.entries());
    
    // Remove expired entries first
    entries.forEach(([key, value]) => {
      if (now - value.timestamp > this.options.cacheTTL) {
        this.resultCache.delete(key);
      }
    });

    // If still too large, remove oldest entries
    if (this.resultCache.size > 800) {
      const sortedEntries = entries
        .filter(([key]) => this.resultCache.has(key))
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = sortedEntries.slice(0, this.resultCache.size - 800);
      toRemove.forEach(([key]) => this.resultCache.delete(key));
    }
  }
}

module.exports = DynamicSearchEngine;