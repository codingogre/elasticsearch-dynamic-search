# Elasticsearch Dynamic Search

🧠 **Intelligent hybrid search library for Elasticsearch with dynamic weight adjustment, proper noun detection, and contextual analysis**

## Features

- 🎯 **Smart Search Strategy Detection** - Automatically determines optimal search approach based on query characteristics
- 🌍 **Regional Query Analysis** - Detects geographical context and adjusts search weights accordingly
- 🏷️ **Advanced Proper Noun Recognition** - Multi-strategy entity detection (known entities, capitalization, acronyms, product codes, version numbers)
- ⚖️ **Dynamic Weight Balancing** - Context-aware lexical/semantic weight adjustment based on query complexity and intent
- 📊 **Detailed Performance Monitoring** - Phase-by-phase search analytics and performance tracking
- 🔧 **Elasticsearch Integration** - Ready-to-use with modern Elasticsearch 8.x

## Installation

```bash
npm install elasticsearch-dynamic-search
```

## Quick Start

```javascript
const { DynamicSearchEngine } = require('elasticsearch-dynamic-search');
const { Client } = require('@elastic/elasticsearch');

// Initialize Elasticsearch client
const client = new Client({
  node: 'https://localhost:9200',
  auth: {
    apiKey: 'your-api-key'
  }
});

// Define your query templates (with mustache variables)
const queryTemplates = {
  rerank: `{
    "retriever": {
      "text_similarity_reranker": {
        "retriever": {
          "linear": {
            "retrievers": [
              {
                "retriever": {
                  "standard": {
                    "query": {
                      "multi_match": {
                        "query": "{{query}}",
                        "fields": ["title^2", "content"]
                      }
                    }
                  }
                },
                "weight": "{{lexical_weight}}"
              },
              {
                "retriever": {
                  "standard": {
                    "query": {
                      "semantic": {
                        "field": "content_vector",
                        "query": "{{query}}"
                      }
                    }
                  }
                },
                "weight": "{{semantic_weight}}"
              }
            ]
          }
        },
        "field": "title",
        "inference_text": "{{query}}",
        "inference_id": "{{inference_id}}"
      }
    },
    "size": 10
  }`,
  noRerank: `{
    "query": {
      "bool": {
        "should": [
          {
            "multi_match": {
              "query": "{{query}}",
              "fields": ["title^2", "content"],
              "boost": "{{lexical_weight}}"
            }
          },
          {
            "semantic": {
              "field": "content_vector",
              "query": "{{query}}",
              "boost": "{{semantic_weight}}"
            }
          }
        ]
      }
    },
    "size": 10
  }`
};

// Create search engine instance
const searchEngine = new DynamicSearchEngine(client, queryTemplates, {
  indexName: 'your-search-index-*',
  enablePerformanceMonitoring: true,
  enableQueryEnhancement: true,
  enableContextualWeighting: true
});

// Perform intelligent search
async function search() {
  try {
    const results = await searchEngine.search('machine learning algorithms', {
      sessionId: 'user-session-123',
      userAgent: 'Mozilla/5.0...',
      timeOfDay: 14,
      domain: 'technical',
      intent: 'exploratory',
      useRerank: true
    });
    
    console.log('Search Results:', results);
    console.log('Applied Strategy:', results.weights.strategy);
    console.log('Weight Distribution:', {
      lexical: `${Math.round(results.weights.lexicalWeight * 100)}%`,
      semantic: `${Math.round(results.weights.semanticWeight * 100)}%`
    });
  } catch (error) {
    console.error('Search failed:', error);
  }
}

search();
```

## Architecture

The library consists of several modular components:

### Core Components

- **`DynamicSearchEngine`** - Main orchestrator that coordinates all components
- **`QueryAnalyzer`** - Analyzes query characteristics and determines search strategy
- **`QueryEnhancer`** - Detects proper nouns, regional context, and query statistics
- **`ContextualWeighter`** - Calculates context-aware weights based on historical data
- **`WeightCombiner`** - Combines analysis results into final lexical/semantic weights
- **`QueryBuilder`** - Constructs Elasticsearch queries from templates and weights
- **`PerformanceMonitor`** - Tracks detailed performance metrics across search phases

## Advanced Usage

### Using Individual Components

```javascript
const { 
  QueryAnalyzer, 
  QueryEnhancer, 
  WeightCombiner 
} = require('elasticsearch-dynamic-search');

const analyzer = new QueryAnalyzer();
const enhancer = new QueryEnhancer();
const combiner = new WeightCombiner();

// Analyze a query
const analysis = analyzer.analyzeQuery('Microsoft Office 365 training');
console.log('Query Strategy:', analysis.strategy);

// Enhance query with proper noun detection
const enhancement = enhancer.enhanceQuery('Microsoft Office 365 training');
console.log('Detected Proper Nouns:', enhancement.properNouns.properNouns);
console.log('Detected Region:', enhancement.detectedRegion);
```

### Custom Configuration

```javascript
const searchEngine = new DynamicSearchEngine(client, queryTemplates, {
  indexName: 'my-index-*',
  enablePerformanceMonitoring: true,
  enableQueryEnhancement: true,
  enableContextualWeighting: true,
  cacheResults: true,
  cacheTTL: 300000, // 5 minutes
  
  // Component-specific options
  queryEnhancer: {
    enableRegionalDetection: true,
    enableProperNounDetection: true
  },
  
  weightCombiner: {
    knowledgeSearchBias: 0.15,
    regionalBias: 0.12,
    longQueryBoost: 0.30,
    properNounLexicalWeight: 0.9
  },
  
  queryBuilder: {
    defaultInferenceId: '.rerank-v1-elasticsearch'
  }
});
```

## Search Strategies

The library automatically detects and applies different strategies based on query characteristics:

- **`exact_match`** - For specific terms that need precise matching
- **`entity_focused`** - When proper nouns are detected (companies, products, etc.)
- **`conceptual`** - For broad, knowledge-seeking queries
- **`short_query`** - Optimized for 1-2 word queries
- **`descriptive`** - For detailed, multi-word descriptive queries
- **`complex`** - For complex queries with multiple concepts
- **`regional_semantic_enhanced`** - When geographical context is detected

## Performance Monitoring

Get detailed insights into search performance:

```javascript
// Get performance statistics
const stats = searchEngine.getStats();
console.log('Total Searches:', stats.totalSearches);
console.log('Average Response Time:', stats.averageResponseTime);
console.log('Strategy Usage:', stats.strategyCounts);

// Clear cache if needed
searchEngine.clearCache();
```

## Query Templates

The library uses mustache-style templates for Elasticsearch queries. Supported variables:

- `{{query}}` - The search query text
- `{{lexical_weight}}` - Calculated lexical weight (0-10 scale)
- `{{semantic_weight}}` - Calculated semantic weight (0-10 scale)
- `{{inference_id}}` - Inference endpoint for reranking

## Requirements

- Node.js >= 14.0.0
- Elasticsearch >= 8.0.0
- Compatible with Elasticsearch's semantic search and reranking features

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on the GitHub repository.