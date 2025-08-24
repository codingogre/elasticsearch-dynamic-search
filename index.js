/**
 * Elasticsearch Dynamic Search Library
 * Intelligent hybrid search with dynamic weight adjustment, proper noun detection, and contextual analysis
 * 
 * @author Your Name
 * @version 1.0.2
 */

const DynamicSearchEngine = require('./lib/dynamic-search-engine');
const QueryAnalyzer = require('./lib/query-analyzer');
const ContextualWeighter = require('./lib/contextual-weighter');
const QueryEnhancer = require('./lib/query-enhancer');
const WeightCombiner = require('./lib/weight-combiner');
const QueryBuilder = require('./lib/query-builder');
const PerformanceMonitor = require('./lib/performance-monitor');

module.exports = {
  // Main search engine
  DynamicSearchEngine,
  
  // Core components (for advanced usage)
  QueryAnalyzer,
  ContextualWeighter,
  QueryEnhancer,
  WeightCombiner,
  QueryBuilder,
  PerformanceMonitor
};

// Export default for ES6 imports
module.exports.default = DynamicSearchEngine;