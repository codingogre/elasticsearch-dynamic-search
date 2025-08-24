class ContextualWeighter {
  constructor(esClient, options = {}) {
    this.client = esClient;
    this.options = {
      sampleSize: 100,
      cacheTTL: 30 * 60 * 1000,
      ...options
    };
    this.corpusCache = new Map();
  }

  async calculateContextualWeights(query, indexName, context = {}) {
    const corpusStats = await this.getCorpusStatistics(indexName);
    const queryCorpusOverlap = await this.calculateQueryCorpusOverlap(query, indexName);
    const userIntent = this.inferUserIntent(query, context);
    
    let lexicalWeight = 0.5;
    let confidence = 0.6;
    let reasoning = [];

    if (corpusStats.avgDocLength > 1000) {
      lexicalWeight -= 0.1;
      reasoning.push('Long documents favor semantic search');
    }
    
    if (corpusStats.termDiversity > 0.8) {
      lexicalWeight -= 0.15;
      reasoning.push('High term diversity favors semantic search');
    }

    if (queryCorpusOverlap > 0.7) {
      lexicalWeight += 0.2;
      confidence += 0.1;
      reasoning.push('High vocabulary overlap favors lexical search');
    } else if (queryCorpusOverlap < 0.3) {
      lexicalWeight -= 0.2;
      reasoning.push('Low vocabulary overlap favors semantic search');
    }

    switch (userIntent.primary) {
      case 'factual':
        lexicalWeight += 0.15;
        reasoning.push('Factual queries benefit from lexical precision');
        break;
      case 'exploratory':
        lexicalWeight -= 0.2;
        reasoning.push('Exploratory queries benefit from semantic breadth');
        break;
      case 'navigational':
        lexicalWeight += 0.25;
        reasoning.push('Navigational queries require lexical precision');
        break;
    }

    if (context.domain === 'technical') {
      lexicalWeight += 0.1;
      reasoning.push('Technical domain benefits from exact term matching');
    } else if (context.domain === 'creative') {
      lexicalWeight -= 0.15;
      reasoning.push('Creative domain benefits from conceptual search');
    }

    lexicalWeight = Math.max(0.1, Math.min(0.9, lexicalWeight));
    const semanticWeight = 1.0 - lexicalWeight;
    confidence = Math.max(0.3, Math.min(0.95, confidence));

    return {
      lexicalWeight,
      semanticWeight,
      confidence,
      reasoning,
      corpusStats,
      queryCorpusOverlap,
      userIntent: userIntent.primary,
      intentConfidence: userIntent.confidence
    };
  }

  async getCorpusStatistics(indexName) {
    const cacheKey = `corpus_${indexName}`;
    const cached = this.corpusCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.options.cacheTTL) {
      return cached.data;
    }

    try {
      const statsQuery = {
        aggs: {
          avg_doc_length: {
            avg: {
              script: {
                source: "if (doc.containsKey('unified_content') && doc['unified_content'].size() > 0) { doc['unified_content'].value.length() } else { 100 }"
              }
            }
          },
          term_diversity: {
            cardinality: {
              field: 'unified_title.keyword',
              precision_threshold: 1000
            }
          },
          total_docs: {
            value_count: { field: 'unified_title.keyword' }
          }
        }
      };

      const response = await this.client.search({
        index: indexName,
        body: statsQuery,
        size: 0
      });

      const aggs = response.aggregations || response.body?.aggregations;
      const stats = {
        avgDocLength: aggs.avg_doc_length.value || 500,
        termDiversity: aggs.term_diversity.value / Math.max(aggs.total_docs.value, 1),
        totalDocs: aggs.total_docs.value,
        timestamp: Date.now()
      };

      this.corpusCache.set(cacheKey, { data: stats, timestamp: Date.now() });
      return stats;
    } catch (error) {
      console.warn(`Failed to get corpus stats: ${error.message}`);
      return {
        avgDocLength: 500,
        termDiversity: 0.5,
        totalDocs: 1000
      };
    }
  }

  async calculateQueryCorpusOverlap(query, indexName) {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    if (queryTerms.length === 0) {
      return 0.5;
    }

    try {
      const termsQuery = {
        aggs: {
          top_terms: {
            terms: {
              field: 'unified_title.keyword',
              size: 100
            }
          }
        }
      };

      const response = await this.client.search({
        index: indexName,
        body: termsQuery,
        size: 0
      });

      const corpusTerms = new Set();
      const aggs = response.aggregations || response.body?.aggregations;
      if (aggs && aggs.top_terms && aggs.top_terms.buckets) {
        aggs.top_terms.buckets.forEach(bucket => {
          bucket.key.toLowerCase().split(/\s+/).forEach(term => {
            if (term.length > 2) corpusTerms.add(term);
          });
        });
      }

      const overlappingTerms = queryTerms.filter(term => corpusTerms.has(term));
      return overlappingTerms.length / queryTerms.length;
    } catch (error) {
      console.warn(`Failed to calculate overlap: ${error.message}`);
      return 0.5;
    }
  }

  inferUserIntent(query, context) {
    const queryLower = query.toLowerCase();
    
    const factualIndicators = ['what', 'when', 'where', 'who', 'how many', 'define'];
    const exploratoryIndicators = ['similar', 'like', 'related', 'about', 'explore', 'discover'];
    const navigationalIndicators = ['login', 'homepage', 'contact', 'support', 'download'];

    let scores = {
      factual: 0,
      exploratory: 0,
      navigational: 0
    };

    factualIndicators.forEach(indicator => {
      if (queryLower.includes(indicator)) scores.factual += 0.3;
    });

    exploratoryIndicators.forEach(indicator => {
      if (queryLower.includes(indicator)) scores.exploratory += 0.3;
    });

    navigationalIndicators.forEach(indicator => {
      if (queryLower.includes(indicator)) scores.navigational += 0.4;
    });

    const maxScore = Math.max(...Object.values(scores));
    const primaryIntent = Object.keys(scores).find(intent => scores[intent] === maxScore);
    
    return {
      primary: primaryIntent || 'exploratory',
      confidence: Math.min(maxScore, 0.9),
      scores
    };
  }
}

module.exports = ContextualWeighter;