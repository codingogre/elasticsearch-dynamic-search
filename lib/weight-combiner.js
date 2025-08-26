/**
 * WeightCombiner - Advanced weight combination logic for dynamic hybrid search
 * Handles complex weight calculations including proper noun, regional, and knowledge-seeking adjustments
 */

class WeightCombiner {
  constructor(options = {}) {
    this.options = {
      // Base configuration
      analysisWeight: 0.4,         // Weight given to query analysis results
      contextualWeight: 0.6,       // Weight given to contextual analysis results
      
      // Bias configurations
      regionalBias: 0.12,          // Semantic bias for regional queries
      
      // Boost configurations
      longQueryBoost: 0.30,        // Semantic boost for 4+ word queries
      mediumQueryBoost: 0.20,      // Semantic boost for 2-3 word queries
      knowledgeQueryBoost: 0.25,   // Extra semantic boost for knowledge-seeking queries
      
      // Proper noun configuration
      properNounLexicalWeight: 0.75,  // Lexical weight for proper noun queries (changed from 0.9)
      properNounSemanticWeight: 0.25, // Semantic weight for proper noun queries (changed from 0.1)
      
      // Weight bounds
      minWeight: 0.1,
      maxWeight: 0.9,
      
      ...options
    };

    // Knowledge-seeking patterns
    this.knowledgePatterns = [
      'explain', 'understand', 'learn', 'concept', 'meaning', 'definition', 
      'guide', 'tutorial', 'how does', 'why does', 'what is', 'how to', 
      'overview', 'introduction', 'basics', 'fundamentals'
    ];
  }

  /**
   * Combine weights from query analysis, contextual analysis, and query enhancement
   * @param {object} queryAnalysis - Results from QueryAnalyzer
   * @param {object} contextualWeights - Results from ContextualWeighter
   * @param {object} queryEnhancement - Results from QueryEnhancer
   * @param {string} query - Original query string
   * @returns {object} Combined weights with strategy and reasoning
   */
  combineWeights(queryAnalysis, contextualWeights, queryEnhancement, query) {
    const reasoning = [];
    
    // Handle proper noun queries first (they override normal processing)
    if (this._isShortProperNounQuery(queryEnhancement)) {
      return this._handleProperNounQuery(queryAnalysis, contextualWeights, queryEnhancement, reasoning);
    }

    // Standard weight combination
    const combinedLexical = (queryAnalysis.lexicalWeight * this.options.analysisWeight) + 
                           (contextualWeights.lexicalWeight * this.options.contextualWeight);
    
    let finalLexicalWeight = this._clamp(combinedLexical);
    let finalSemanticWeight = 1.0 - finalLexicalWeight;

    // Add reasoning from component analyses
    reasoning.push(...(queryAnalysis.reasoning || []));
    reasoning.push(...(contextualWeights.reasoning || []));

    // Knowledge search bias removed

    // Apply query length boosts
    const queryStats = queryEnhancement.queryStats;
    let semanticBoost = 0;
    
    if (queryStats.wordCount >= 4) {
      semanticBoost = this.options.longQueryBoost;
      reasoning.push(`Long query (${queryStats.wordCount} words) - extra ${Math.round(semanticBoost * 100)}% semantic boost`);
    } else if (queryStats.wordCount >= 2) {
      semanticBoost = this.options.mediumQueryBoost;
      reasoning.push(`Medium query (${queryStats.wordCount} words) - extra ${Math.round(semanticBoost * 100)}% semantic boost`);
    }

    // Apply knowledge query boost
    const isKnowledgeQuery = this._detectKnowledgeQuery(query);
    if (isKnowledgeQuery) {
      semanticBoost += this.options.knowledgeQueryBoost;
      reasoning.push(`Knowledge-seeking query detected - extra ${Math.round(this.options.knowledgeQueryBoost * 100)}% semantic boost`);
    }

    // Apply semantic boosts
    if (semanticBoost > 0) {
      const adjustedLexicalWeight = finalLexicalWeight * (1 - semanticBoost);
      const adjustedSemanticWeight = finalSemanticWeight + (finalLexicalWeight * semanticBoost);
      
      finalLexicalWeight = Math.max(this.options.minWeight, adjustedLexicalWeight);
      finalSemanticWeight = Math.min(this.options.maxWeight, adjustedSemanticWeight);
      
      // Normalize
      const total = finalLexicalWeight + finalSemanticWeight;
      finalLexicalWeight = finalLexicalWeight / total;
      finalSemanticWeight = finalSemanticWeight / total;
    }

    // Apply regional adjustments
    if (queryEnhancement.detectedRegion) {
      const { lexical, semantic } = this._applyRegionalAdjustment(finalLexicalWeight, finalSemanticWeight);
      finalLexicalWeight = lexical;
      finalSemanticWeight = semantic;
      reasoning.push(`Regional query detected (${queryEnhancement.detectedRegion}) - extra ${Math.round(this.options.regionalBias * 100)}% semantic boost`);
    }

    // Calculate final confidence
    const confidence = this._calculateConfidence(queryAnalysis, contextualWeights, queryEnhancement);

    return {
      lexicalWeight: finalLexicalWeight,
      semanticWeight: finalSemanticWeight,
      confidence: confidence,
      strategy: this._determineStrategy(queryAnalysis, queryEnhancement),
      reasoning: reasoning,
      ...(queryEnhancement.properNouns.hasProperNouns && { properNouns: queryEnhancement.properNouns.properNouns })
    };
  }

  /**
   * Handle proper noun queries with special logic
   * @private
   */
  _handleProperNounQuery(queryAnalysis, contextualWeights, queryEnhancement, reasoning) {
    let lexicalWeight = this.options.properNounLexicalWeight;
    let semanticWeight = this.options.properNounSemanticWeight;
    
    // Add component reasoning
    reasoning.push(...(queryAnalysis.reasoning || []));
    reasoning.push(...(contextualWeights.reasoning || []));
    
    // Add proper noun reasoning
    const wordCount = queryEnhancement.queryStats.wordCount;
    const properNouns = queryEnhancement.properNouns.properNouns.join(', ');
    reasoning.push(`Short query (${wordCount} words) with proper nouns detected (${properNouns}) - extra ${Math.round((this.options.properNounLexicalWeight - 0.5) * 100)}% lexical boost`);
    
    // Apply regional adjustment to proper noun queries
    if (queryEnhancement.detectedRegion) {
      const { lexical, semantic } = this._applyRegionalAdjustment(lexicalWeight, semanticWeight);
      lexicalWeight = lexical;
      semanticWeight = semantic;
      reasoning.push(`Regional query detected (${queryEnhancement.detectedRegion}) - extra ${Math.round(this.options.regionalBias * 100)}% semantic boost`);
    }

    return {
      lexicalWeight: lexicalWeight,
      semanticWeight: semanticWeight,
      confidence: 0.95, // High confidence for proper noun detection
      strategy: 'short_proper_noun_lexical',
      reasoning: reasoning,
      properNouns: queryEnhancement.properNouns.properNouns
    };
  }

  /**
   * Apply regional adjustment to weights
   * @private
   */
  _applyRegionalAdjustment(lexicalWeight, semanticWeight) {
    // Regional queries benefit from semantic understanding of location context
    const adjustedLexicalWeight = Math.max(this.options.minWeight, lexicalWeight - this.options.regionalBias);
    const adjustedSemanticWeight = Math.min(this.options.maxWeight, semanticWeight + this.options.regionalBias);
    
    // Normalize to ensure they sum to 1.0
    const total = adjustedLexicalWeight + adjustedSemanticWeight;
    
    return {
      lexical: adjustedLexicalWeight / total,
      semantic: adjustedSemanticWeight / total
    };
  }

  /**
   * Determine if this is a short proper noun query
   * @private
   */
  _isShortProperNounQuery(queryEnhancement) {
    return queryEnhancement.queryStats.wordCount <= 2 && 
           queryEnhancement.properNouns.hasProperNouns;
  }

  /**
   * Detect knowledge-seeking patterns in query
   * @private
   */
  _detectKnowledgeQuery(query) {
    if (!query || typeof query !== 'string') return false;
    
    const queryLower = query.toLowerCase();
    return this.knowledgePatterns.some(pattern => queryLower.includes(pattern));
  }

  /**
   * Calculate combined confidence score
   * @private
   */
  _calculateConfidence(queryAnalysis, contextualWeights, queryEnhancement) {
    let confidence = (queryAnalysis.confidence + contextualWeights.confidence) / 2;
    
    // Boost confidence for proper noun detection
    if (queryEnhancement.properNouns.hasProperNouns) {
      confidence = Math.max(confidence, queryEnhancement.properNouns.confidence);
    }
    
    // Boost confidence for regional detection
    if (queryEnhancement.detectedRegion) {
      confidence = Math.min(1.0, confidence + 0.1);
    }
    
    return confidence;
  }

  /**
   * Determine the search strategy based on analyses
   * @private
   */
  _determineStrategy(queryAnalysis, queryEnhancement) {
    // Proper noun queries override other strategies
    if (this._isShortProperNounQuery(queryEnhancement)) {
      return 'short_proper_noun_lexical';
    }
    
    // Regional queries
    if (queryEnhancement.detectedRegion) {
      return 'regional_semantic_enhanced';
    }
    
    // Fall back to query analyzer strategy
    return queryAnalysis.strategy || 'balanced_hybrid';
  }

  /**
   * Clamp a value between min and max weights
   * @private
   */
  _clamp(value) {
    return Math.max(this.options.minWeight, Math.min(this.options.maxWeight, value));
  }

  /**
   * Update configuration options
   * @param {object} newOptions - New options to merge
   */
  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Add custom knowledge patterns
   * @param {Array<string>} patterns - Array of knowledge-seeking patterns
   */
  addKnowledgePatterns(patterns) {
    this.knowledgePatterns.push(...patterns);
  }

  /**
   * Get current configuration
   * @returns {object} Current options
   */
  getOptions() {
    return { ...this.options };
  }
}

module.exports = WeightCombiner;