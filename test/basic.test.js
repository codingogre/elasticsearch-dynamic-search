/**
 * Basic tests for Elasticsearch Dynamic Search
 * Run with: node test/basic.test.js
 */

const { 
  DynamicSearchEngine, 
  QueryAnalyzer, 
  QueryEnhancer, 
  WeightCombiner,
  PerformanceMonitor 
} = require('../index');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function testQueryAnalyzer() {
  console.log('🧪 Testing QueryAnalyzer...');
  
  const analyzer = new QueryAnalyzer();
  
  // Test entity-focused query (short technical term)
  const shortQuery = analyzer.analyzeQuery('API');
  assert(shortQuery.strategy === 'entity_focused', 'Entity focused strategy should be detected for technical terms');
  assert(shortQuery.lexicalWeight > shortQuery.semanticWeight, 'Technical terms should favor lexical');
  
  // Test descriptive query
  const longQuery = analyzer.analyzeQuery('how to implement machine learning algorithms for customer segmentation');
  assert(longQuery.strategy === 'descriptive', 'Descriptive strategy should be detected');
  assert(longQuery.semanticWeight > shortQuery.semanticWeight, 'Long queries should have higher semantic weight');
  
  console.log('✅ QueryAnalyzer tests passed');
}

function testQueryEnhancer() {
  console.log('🧪 Testing QueryEnhancer...');
  
  const enhancer = new QueryEnhancer();
  
  // Test proper noun detection
  const properNounQuery = enhancer.enhanceQuery('Microsoft Office 365');
  assert(properNounQuery.properNouns.hasProperNouns, 'Should detect proper nouns');
  assert(properNounQuery.properNouns.properNouns.includes('Microsoft'), 'Should detect Microsoft as proper noun');
  
  // Test regional detection
  const regionalQuery = enhancer.enhanceQuery('UK sales training materials');
  assert(regionalQuery.detectedRegion === 'UK', 'Should detect UK region');
  
  // Test query stats
  const stats = enhancer.enhanceQuery('test query with multiple words');
  assert(stats.queryStats.wordCount === 5, 'Should count words correctly');
  
  console.log('✅ QueryEnhancer tests passed');
}

function testWeightCombiner() {
  console.log('🧪 Testing WeightCombiner...');
  
  const combiner = new WeightCombiner();
  
  // Mock inputs
  const queryAnalysis = {
    lexicalWeight: 0.6,
    semanticWeight: 0.4,
    confidence: 0.8,
    strategy: 'balanced',
    reasoning: ['Test analysis']
  };
  
  const contextualWeights = {
    lexicalWeight: 0.5,
    semanticWeight: 0.5,
    confidence: 0.7,
    reasoning: ['Test contextual']
  };
  
  const queryEnhancement = {
    queryStats: { wordCount: 3 },
    detectedRegion: null,
    properNouns: { hasProperNouns: false, properNouns: [] }
  };
  
  const result = combiner.combineWeights(queryAnalysis, contextualWeights, queryEnhancement, 'test query');
  
  assert(typeof result.lexicalWeight === 'number', 'Should return lexical weight');
  assert(typeof result.semanticWeight === 'number', 'Should return semantic weight');
  assert(Math.abs(result.lexicalWeight + result.semanticWeight - 1.0) < 0.001, 'Weights should sum to 1.0');
  assert(result.reasoning && result.reasoning.length > 0, 'Should provide reasoning');
  
  console.log('✅ WeightCombiner tests passed');
}

function testPerformanceMonitor() {
  console.log('🧪 Testing PerformanceMonitor...');
  
  const monitor = new PerformanceMonitor();
  
  // Test search session tracking
  const searchMonitor = monitor.startSearch('test_search_123');
  assert(typeof searchMonitor.startPhase === 'function', 'Should return monitor with startPhase method');
  assert(typeof searchMonitor.endPhase === 'function', 'Should return monitor with endPhase method');
  assert(typeof searchMonitor.complete === 'function', 'Should return monitor with complete method');
  
  // Test phase tracking
  searchMonitor.startPhase('query_analysis');
  setTimeout(() => {
    searchMonitor.endPhase('query_analysis');
    searchMonitor.complete();
  }, 10);
  
  // Test search recording
  monitor.recordSearch({
    query: 'test',
    weights: { lexical: 0.5, semantic: 0.5 },
    strategy: 'test',
    resultCount: 10,
    searchTime: 100,
    sessionId: 'test_session'
  });
  
  console.log('✅ PerformanceMonitor tests passed');
}

function testPackageStructure() {
  console.log('🧪 Testing package structure...');
  
  const pkg = require('../index');
  
  // Test exports
  assert(pkg.DynamicSearchEngine, 'Should export DynamicSearchEngine');
  assert(pkg.QueryAnalyzer, 'Should export QueryAnalyzer');
  assert(pkg.QueryEnhancer, 'Should export QueryEnhancer');
  assert(pkg.ContextualWeighter, 'Should export ContextualWeighter');
  assert(pkg.WeightCombiner, 'Should export WeightCombiner');
  assert(pkg.QueryBuilder, 'Should export QueryBuilder');
  assert(pkg.PerformanceMonitor, 'Should export PerformanceMonitor');
  
  console.log('✅ Package structure tests passed');
}

async function runAllTests() {
  console.log('🚀 Running Elasticsearch Dynamic Search Tests\n');
  
  try {
    testPackageStructure();
    testQueryAnalyzer();
    testQueryEnhancer();
    testWeightCombiner();
    testPerformanceMonitor();
    
    console.log('\n🎉 All tests passed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };