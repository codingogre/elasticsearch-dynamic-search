const natural = require('natural');
const nlp = require('compromise');

class QueryAnalyzer {
  constructor(options = {}) {
    this.entityPatterns = [
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
      /\b\d{4}\b/g,
      /\b[A-Z]{2,}\b/g,
      /\b\w+@\w+\.\w+\b/g,
      /\bhttps?:\/\/\S+\b/g
    ];

    this.conceptualWords = new Set([
      'similar', 'like', 'related', 'about', 'regarding',
      'concept', 'idea', 'meaning', 'definition', 'explain',
      'understand', 'learn', 'discover', 'find', 'search'
    ]);

    this.exactMatchIndicators = new Set([
      'exactly', 'precise', 'specific', 'particular', 'certain'
    ]);

    this.options = {
      maxQueryLength: 20,
      entityThreshold: 0.3,
      conceptualThreshold: 0.2,
      ...options
    };
  }

  analyzeQuery(query, context = {}) {
    if (!query || typeof query !== 'string') {
      throw new Error('Query must be a non-empty string');
    }

    const analysis = this._performAnalysis(query);
    const weights = this._calculateWeights(analysis, context);
    
    return {
      lexicalWeight: Math.max(0.1, Math.min(0.9, weights.lexical)),
      semanticWeight: Math.max(0.1, Math.min(0.9, weights.semantic)),
      confidence: weights.confidence,
      analysis: analysis,
      strategy: weights.strategy,
      reasoning: weights.reasoning
    };
  }

  _performAnalysis(query) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    const doc = nlp(query);
    const entities = doc.topics().out('array');
    const verbs = doc.verbs().out('array');
    const nouns = doc.nouns().out('array');
    
    let entityCount = entities.length;
    this.entityPatterns.forEach(pattern => {
      const matches = query.match(pattern) || [];
      entityCount += matches.length;
    });

    const conceptualCount = words.filter(word => 
      this.conceptualWords.has(word)
    ).length;

    const exactMatchCount = words.filter(word => 
      this.exactMatchIndicators.has(word)
    ).length;

    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / wordCount;
    const uniqueWordRatio = new Set(words).size / wordCount;
    const quotedPhrases = (query.match(/["']([^"']+)["']/g) || []).length;
    
    return {
      wordCount,
      entityCount,
      conceptualCount,
      exactMatchCount,
      quotedPhrases,
      avgWordLength,
      uniqueWordRatio,
      entityRatio: entityCount / Math.max(wordCount, 1),
      conceptualRatio: conceptualCount / Math.max(wordCount, 1),
      exactMatchRatio: exactMatchCount / Math.max(wordCount, 1),
      hasVerbs: verbs.length > 0,
      hasNouns: nouns.length > 0,
      complexity: this._calculateComplexity(words, entities, verbs, nouns)
    };
  }

  _calculateComplexity(words, entities, verbs, nouns) {
    const factors = [
      words.length > 10 ? 0.3 : 0,
      entities.length > 2 ? 0.2 : 0,
      verbs.length > 1 ? 0.2 : 0,
      nouns.length > 3 ? 0.3 : 0
    ];
    return factors.reduce((sum, factor) => sum + factor, 0);
  }

  _calculateWeights(analysis, context) {
    let lexicalWeight = 0.5;
    let strategy = 'balanced';
    let confidence = 0.6;
    let reasoning = [];

    if (analysis.quotedPhrases > 0 || analysis.exactMatchRatio > 0.1) {
      lexicalWeight = 0.8;
      strategy = 'exact_match';
      confidence = 0.9;
      reasoning.push('Exact match indicators - extra 30% lexical boost');
    } else if (analysis.entityRatio > this.options.entityThreshold) {
      lexicalWeight = 0.75;
      strategy = 'entity_focused';
      confidence = 0.8;
      reasoning.push('High entity content - extra 25% lexical boost');
    } else if (analysis.conceptualRatio > this.options.conceptualThreshold) {
      lexicalWeight = 0.3;
      strategy = 'conceptual';
      confidence = 0.8;
      reasoning.push('Conceptual query - extra 20% semantic boost');
    } else if (analysis.wordCount <= 2) {
      lexicalWeight = 0.65;
      strategy = 'short_query';
      confidence = 0.7;
      reasoning.push('Short queries - extra 15% lexical boost');
    } else if (analysis.wordCount >= 8) {
      lexicalWeight = 0.4 + (analysis.entityRatio * 0.3);
      strategy = 'descriptive';
      confidence = 0.75;
      reasoning.push('Long descriptive queries - balanced approach with entity adjustment');
    }

    if (context.userIntent === 'factual') {
      lexicalWeight += 0.1;
      reasoning.push('Factual intent - extra 10% lexical boost');
    } else if (context.userIntent === 'exploratory') {
      lexicalWeight -= 0.15;
      reasoning.push('Exploratory intent - extra 15% semantic boost');
    }

    if (context.domain === 'technical') {
      lexicalWeight += 0.05;
      reasoning.push('Technical domain - extra 5% lexical boost');
    }

    const semanticWeight = 1.0 - lexicalWeight;

    return {
      lexical: lexicalWeight,
      semantic: semanticWeight,
      confidence,
      strategy,
      reasoning
    };
  }
}

module.exports = QueryAnalyzer;