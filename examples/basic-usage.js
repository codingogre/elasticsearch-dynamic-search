/**
 * Basic Usage Example for Elasticsearch Dynamic Search
 */

const { DynamicSearchEngine } = require('../index');
const { Client } = require('@elastic/elasticsearch');

// Example query templates
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
                        "fields": ["unified_title^2", "unified_content", "unified_description"]
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
                        "field": "all_text_semantic",
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
        "field": "unified_title",
        "inference_text": "{{query}}",
        "inference_id": "{{inference_id}}"
      }
    },
    "size": 10,
    "fields": ["unified_title", "unified_content", "unified_description"],
    "_source": false
  }`,
  
  noRerank: `{
    "query": {
      "bool": {
        "should": [
          {
            "multi_match": {
              "query": "{{query}}",
              "fields": ["unified_title^2", "unified_content", "unified_description"],
              "boost": "{{lexical_weight}}"
            }
          },
          {
            "semantic": {
              "field": "all_text_semantic", 
              "query": "{{query}}",
              "boost": "{{semantic_weight}}"
            }
          }
        ]
      }
    },
    "size": 10,
    "fields": ["unified_title", "unified_content", "unified_description"],
    "_source": false
  }`
};

async function runExample() {
  // Initialize Elasticsearch client
  const client = new Client({
    node: 'https://localhost:9200',
    // Add your authentication here
    // auth: { apiKey: 'your-api-key' }
  });

  // Create search engine instance
  const searchEngine = new DynamicSearchEngine(client, queryTemplates, {
    indexName: 'your-index-*',
    enablePerformanceMonitoring: true,
    enableQueryEnhancement: true,
    enableContextualWeighting: true,
    cacheResults: false
  });

  // Example queries demonstrating different strategies
  const exampleQueries = [
    {
      query: 'Microsoft Office',
      description: 'Proper noun query - should favor lexical search'
    },
    {
      query: 'how to improve team collaboration',
      description: 'Knowledge-seeking query - should favor semantic search'
    },
    {
      query: 'UK sales training materials',
      description: 'Regional query - should detect UK and boost semantic understanding'
    },
    {
      query: 'API documentation REST endpoints authentication',
      description: 'Technical complex query - should use balanced hybrid approach'
    }
  ];

  console.log('🔍 Elasticsearch Dynamic Search - Example Usage\n');

  for (const example of exampleQueries) {
    try {
      console.log(`Query: "${example.query}"`);
      console.log(`Expected: ${example.description}\n`);

      const userContext = {
        sessionId: `session_${Date.now()}`,
        userAgent: 'Example/1.0',
        timeOfDay: new Date().getHours(),
        domain: 'general',
        intent: 'exploratory',
        useRerank: true
      };

      const results = await searchEngine.search(example.query, userContext);

      // Display results
      console.log(`📊 Results: ${results.total} documents found`);
      console.log(`⚡ Search time: ${results.searchTime}ms`);
      console.log(`🎯 Strategy: ${results.weights.strategy}`);
      console.log(`⚖️  Weights: Lexical ${Math.round(results.weights.lexicalWeight * 100)}% | Semantic ${Math.round(results.weights.semanticWeight * 100)}%`);
      console.log(`🎯 Confidence: ${Math.round(results.weights.confidence * 100)}%`);
      
      if (results.weights.reasoning && results.weights.reasoning.length > 0) {
        console.log('💭 Reasoning:');
        results.weights.reasoning.forEach(reason => {
          console.log(`   • ${reason}`);
        });
      }

      if (results.hits && results.hits.length > 0) {
        console.log(`📄 Top result: "${results.hits[0].source.unified_title || 'Untitled'}"`);
      }

      console.log('\n' + '─'.repeat(80) + '\n');

    } catch (error) {
      console.error(`❌ Search failed for "${example.query}":`, error.message);
      console.log('\n' + '─'.repeat(80) + '\n');
    }
  }

  // Display overall statistics
  const stats = searchEngine.getStats();
  console.log('📈 Performance Statistics:');
  console.log(`   Total searches: ${stats.totalSearches}`);
  console.log(`   Average response time: ${Math.round(stats.averageResponseTime)}ms`);
  console.log(`   Strategy usage:`, stats.strategyCounts);
  console.log(`   Cache size: ${stats.cacheSize} entries`);
}

// Run the example
if (require.main === module) {
  runExample().catch(console.error);
}

module.exports = { runExample };