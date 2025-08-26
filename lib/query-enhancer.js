/**
 * QueryEnhancer - Handles query enhancement including regional detection and proper noun analysis
 * Separates enhancement logic from main application code
 */

const { countries } = require('countries-list');
const nlp = require('compromise');
const words = require('wordlist-english');

class QueryEnhancer {
  constructor(options = {}) {
    this.options = {
      enableRegionalDetection: true,
      enableProperNounDetection: true,
      ...options
    };

    // Generate regional patterns from countries-list package
    this.regionPatterns = this._generateRegionalPatterns();

    // Create English words set from wordlist-english for fast lookup
    this.englishWords = new Set(words.english);
  }

  /**
   * Enhance a query with regional and proper noun analysis
   * @param {string} query - The search query
   * @returns {object} Enhancement results including regions and proper nouns detected
   */
  enhanceQuery(query) {
    if (!query || typeof query !== 'string') {
      return this._getEmptyEnhancement();
    }

    const enhancement = {
      originalQuery: query,
      detectedRegion: null,
      properNouns: {
        hasProperNouns: false,
        properNouns: [],
        confidence: 0
      },
      queryStats: this._getQueryStats(query),
      shouldAutoDisableRerank: false // New field for auto-disable decision
    };

    if (this.options.enableRegionalDetection) {
      enhancement.detectedRegion = this.detectRegion(query);
    }

    if (this.options.enableProperNounDetection) {
      enhancement.properNouns = this.detectProperNouns(query);
    }

    // Determine if reranking should be auto-disabled
    enhancement.shouldAutoDisableRerank = this.shouldAutoDisableRerank(query);

    // Add domain and intent classification
    enhancement.domain = this.inferDomain(query);
    enhancement.intent = this.inferIntent(query);

    return enhancement;
  }

  /**
   * Determine if reranking should be auto-disabled for this query
   * @param {string} query - The search query
   * @returns {boolean} True if reranking should be auto-disabled
   */
  shouldAutoDisableRerank(query) {
    if (!query || typeof query !== 'string') return false;
    
    const stats = this._getQueryStats(query);
    const properNouns = this.detectProperNouns(query);
    
    // Auto-disable for single-word proper noun queries
    // (Note: Updated package has detectProperNouns only work for single words)
    return stats.wordCount === 1 && properNouns.hasProperNouns;
  }

  /**
   * Detect regional context in query
   * @param {string} query - The search query
   * @returns {string|null} Detected region code or null
   */
  detectRegion(query) {
    if (!query || typeof query !== 'string') return null;
    
    const queryWords = query.split(/\s+/);
    
    // Check for exact matches first (more specific)
    for (const [region, patterns] of Object.entries(this.regionPatterns)) {
      for (const pattern of patterns) {
        
        // For 2-letter country codes, only match if they're uppercase in the original query
        if (pattern.length === 2 && /^[A-Z]{2}$/.test(pattern)) {
          // Check if this exact uppercase pattern exists as a whole word in the query
          const exactPattern = new RegExp(`\\b${pattern}\\b`);
          if (exactPattern.test(query)) {
            return region;
          }
        } else {
          // For longer country names and patterns, do case-insensitive matching
          const patternLower = pattern.toLowerCase();
          const queryLower = query.toLowerCase();
          
          // Check for whole word matches to avoid false positives
          const wordBoundaryPattern = new RegExp(`\\b${patternLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
          if (wordBoundaryPattern.test(queryLower)) {
            return region;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Detect proper nouns in query using compromise NLP library
   * @param {string} query - The search query
   * @returns {object} Proper noun analysis results
   */
  detectProperNouns(query) {
    if (!query || typeof query !== 'string') {
      return { hasProperNouns: false, properNouns: [], confidence: 0 };
    }

    const words = query.trim().split(/\s+/);
    
    // Only apply proper noun detection to single-word queries
    if (words.length !== 1) {
      return { hasProperNouns: false, properNouns: [], confidence: 0 };
    }

    const detectedNouns = [];
    let totalConfidence = 0;

    // Use compromise for advanced NLP analysis
    const doc = nlp(query);
    
    // Check for various types of proper nouns using compromise
    const properNounChecks = [
      { method: doc.people(), type: 'Person', confidence: 0.95 },
      { method: doc.places(), type: 'Place', confidence: 0.9 },
      { method: doc.organizations(), type: 'Organization', confidence: 0.9 },
      { method: doc.match('#ProperNoun'), type: 'ProperNoun', confidence: 0.8 },
      { method: doc.acronyms(), type: 'Acronym', confidence: 0.85 }
    ];

    // Check if compromise detects any proper nouns
    let compromiseDetected = false;
    let compromiseType = null;
    let compromiseConfidence = 0;
    
    for (const check of properNounChecks) {
      if (check.method.found && check.method.text().toLowerCase() === query.toLowerCase()) {
        compromiseDetected = true;
        compromiseType = check.type;
        compromiseConfidence = check.confidence;
        break;
      }
    }

    // Also check our existing strategies for the single word
    const word = words[0];
    const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
    let manualConfidence = 0;
    let reasons = [];

    // Use compromise detection as primary signal
    if (compromiseDetected) {
      manualConfidence += compromiseConfidence;
      reasons.push(`nlp_${compromiseType.toLowerCase()}`);
    }

    // Strategy 1: Enterprise Context - Capitalized Non-Dictionary Words
    // In enterprise environments, capitalized words not in the English dictionary are likely proper nouns
    if (this._hasCapitalization(word) && !this._isEnglishWord(cleanWord)) {
      manualConfidence += 0.7;
      reasons.push('capitalized_non_dictionary');
    }

    // Strategy 2: Capitalization with Dictionary Check
    // Capitalized words that ARE in dictionary get lower confidence (might be sentence starts)
    if (this._hasProperCapitalization(word)) {
      if (this._isEnglishWord(cleanWord)) {
        manualConfidence += 0.1; // Lower confidence for dictionary words
        reasons.push('capitalized_dictionary_word');
      } else {
        manualConfidence += 0.5; // Higher confidence for non-dictionary words
        reasons.push('capitalized_non_dictionary_word');
      }
    }

    // Strategy 3: Acronym detection (2+ uppercase letters)
    if (this._isAcronym(word)) {
      manualConfidence += 0.6; // Higher confidence for acronyms
      reasons.push('acronym');
    }

    // Strategy 4: Product code patterns (alphanumeric with specific patterns)
    if (this._isProductCode(word)) {
      manualConfidence += 0.4;
      reasons.push('product_code');
    }

    // Strategy 5: All caps words (likely acronyms/brands)
    if (this._isAllCaps(word) && word.length >= 2) {
      manualConfidence += 0.5;
      reasons.push('all_caps');
    }

    // If confidence is above threshold, consider it a proper noun
    // LOWERED threshold from 0.4 to 0.2 for enterprise context
    const finalConfidence = Math.min(manualConfidence, 1.0);
    if (finalConfidence >= 0.2 || compromiseDetected) {
      detectedNouns.push({
        word: word,
        confidence: finalConfidence,
        reasons: reasons,
        nlpType: compromiseType
      });
      totalConfidence += finalConfidence;
    }

    const avgConfidence = detectedNouns.length > 0 ? totalConfidence / detectedNouns.length : 0;
    
    return {
      hasProperNouns: detectedNouns.length > 0,
      properNouns: detectedNouns.map(n => n.word),
      confidence: Math.min(avgConfidence, 1.0),
      analysis: detectedNouns
    };
  }

  /**
   * Get basic query statistics
   * @private
   */
  _getQueryStats(query) {
    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    return {
      wordCount: words.length,
      characterCount: query.length,
      avgWordLength: words.length > 0 ? words.reduce((sum, w) => sum + w.length, 0) / words.length : 0
    };
  }

  /**
   * Get empty enhancement object
   * @private
   */
  _getEmptyEnhancement() {
    return {
      originalQuery: '',
      detectedRegion: null,
      properNouns: { hasProperNouns: false, properNouns: [], confidence: 0 },
      queryStats: { wordCount: 0, characterCount: 0, avgWordLength: 0 },
      shouldAutoDisableRerank: false,
      domain: 'general',
      intent: 'general'
    };
  }

  /**
   * Check if word has proper capitalization (first letter uppercase, rest lowercase)
   * @private
   */
  _hasProperCapitalization(word) {
    return /^[A-Z][a-z]+$/.test(word) && word.length > 1;
  }

  /**
   * Check if word is an acronym (2+ uppercase letters)
   * @private
   */
  _isAcronym(word) {
    return /^[A-Z]{2,}$/.test(word) || /^[A-Z]+(&[A-Z]+)*$/.test(word);
  }

  /**
   * Check if word looks like a product code
   * @private
   */
  _isProductCode(word) {
    // Patterns like: ABC123, 123ABC, AB-123, etc.
    return /^[A-Za-z0-9]+[-_]?[A-Za-z0-9]+$/.test(word) && 
           /[A-Za-z]/.test(word) && 
           /[0-9]/.test(word);
  }


  /**
   * Check if word is all uppercase
   * @private
   */
  _isAllCaps(word) {
    return word === word.toUpperCase() && /[A-Z]/.test(word);
  }


  /**
   * Add custom regional patterns
   * @param {string} regionCode - Region code (e.g., 'US', 'UK')
   * @param {Array<string>} patterns - Array of patterns for this region
   */
  addRegionalPatterns(regionCode, patterns) {
    if (!this.regionPatterns[regionCode]) {
      this.regionPatterns[regionCode] = [];
    }
    this.regionPatterns[regionCode].push(...patterns);
  }

  /**
   * Infer the domain/category of a search query
   * @param {string} query - The search query
   * @returns {string} Domain classification: 'technical', 'business', or 'general'
   */
  inferDomain(query) {
    if (!query || typeof query !== 'string') return 'general';

    const technicalTerms = ['api', 'code', 'database', 'server', 'configuration', 'system'];
    const businessTerms = ['policy', 'process', 'training', 'compliance', 'procedure'];
    
    const lowerQuery = query.toLowerCase();
    
    if (technicalTerms.some(term => lowerQuery.includes(term))) {
      return 'technical';
    } else if (businessTerms.some(term => lowerQuery.includes(term))) {
      return 'business';
    }
    
    return 'general';
  }

  /**
   * Infer the intent/purpose of a search query
   * @param {string} query - The search query
   * @returns {string} Intent classification: 'factual', 'exploratory', or 'general'
   */
  inferIntent(query) {
    if (!query || typeof query !== 'string') return 'general';

    const factualIndicators = ['what', 'when', 'where', 'who', 'how'];
    const exploratoryIndicators = ['similar', 'like', 'about', 'related'];
    
    const lowerQuery = query.toLowerCase();
    
    if (factualIndicators.some(indicator => lowerQuery.includes(indicator))) {
      return 'factual';
    } else if (exploratoryIndicators.some(indicator => lowerQuery.includes(indicator))) {
      return 'exploratory';
    }
    
    return 'general';
  }

  /**
   * Generate regional patterns from countries-list data
   * @private
   */
  _generateRegionalPatterns() {
    const patterns = {};
    
    for (const [countryCode, countryData] of Object.entries(countries)) {
      const countryPatterns = [
        countryCode,
        countryData.name,
        countryData.native // Native name if different from English name
      ];
      
      // Add only critical special cases that can't be derived
      const criticalCases = this._getCriticalSpecialCases(countryCode);
      countryPatterns.push(...criticalCases);
      
      patterns[countryCode] = [...new Set(countryPatterns.filter(p => p && p.length > 0))];
    }
    
    return patterns;
  }
  
  
  /**
   * Get critical special cases that cannot be derived from country names
   * Only includes the most commonly used alternatives in search queries
   * @private
   */
  _getCriticalSpecialCases(countryCode) {
    // Only include cases where alternative names are very commonly used
    // and cannot be reasonably derived from the official country name
    const criticalCases = {
      'US': ['USA', 'America', 'American'],
      'GB': ['UK', 'Britain', 'British', 'England', 'English'], 
      'NL': ['Dutch', 'Holland'],
      'CH': ['Swiss'],
      'KR': ['Korea', 'South Korea'],
      'DE': ['Deutschland']
    };
    
    return criticalCases[countryCode] || [];
  }

  /**
   * Check if word has any capitalization (more permissive than _hasProperCapitalization)
   * @private
   */
  _hasCapitalization(word) {
    return /^[A-Z]/.test(word);
  }

  /**
   * Check if word is in the English dictionary
   * @private
   */
  _isEnglishWord(word) {
    return this.englishWords.has(word.toLowerCase());
  }
  
}

module.exports = QueryEnhancer;