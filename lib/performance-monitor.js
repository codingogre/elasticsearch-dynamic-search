class PerformanceMonitor {
  constructor(options = {}) {
    this.metrics = {
      searches: [],
      clickThroughs: [],
      dwellTimes: [],
      queryAnalysis: []
    };
    
    this.options = {
      maxHistorySize: 10000,
      metricWindow: 24 * 60 * 60 * 1000,
      ...options
    };

    // Track active search sessions for detailed monitoring
    this.activeSessions = new Map();
  }

  /**
   * Start monitoring a search session
   * @param {string} searchId - Unique identifier for the search
   * @returns {object} Search monitor instance
   */
  startSearch(searchId) {
    const sessionData = {
      searchId,
      startTime: Date.now(),
      phases: {},
      currentPhase: null
    };
    
    this.activeSessions.set(searchId, sessionData);
    
    return {
      startPhase: (phaseName) => this.startPhase(searchId, phaseName),
      endPhase: (phaseName) => this.endPhase(searchId, phaseName),
      complete: () => this.completeSearch(searchId)
    };
  }

  /**
   * Start a phase within a search session
   * @param {string} searchId - Search session identifier
   * @param {string} phaseName - Name of the phase
   */
  startPhase(searchId, phaseName) {
    const session = this.activeSessions.get(searchId);
    if (!session) return;
    
    session.currentPhase = phaseName;
    session.phases[phaseName] = {
      startTime: Date.now(),
      endTime: null,
      duration: null
    };
  }

  /**
   * End a phase within a search session
   * @param {string} searchId - Search session identifier 
   * @param {string} phaseName - Name of the phase
   */
  endPhase(searchId, phaseName) {
    const session = this.activeSessions.get(searchId);
    if (!session || !session.phases[phaseName]) return;
    
    const phase = session.phases[phaseName];
    phase.endTime = Date.now();
    phase.duration = phase.endTime - phase.startTime;
    
    if (session.currentPhase === phaseName) {
      session.currentPhase = null;
    }
  }

  /**
   * Complete a search session and record metrics
   * @param {string} searchId - Search session identifier
   */
  completeSearch(searchId) {
    const session = this.activeSessions.get(searchId);
    if (!session) return;
    
    const totalDuration = Date.now() - session.startTime;
    
    // Record the detailed search metrics
    const searchMetrics = {
      timestamp: session.startTime,
      searchId: searchId,
      totalDuration: totalDuration,
      phases: { ...session.phases }
    };
    
    this.metrics.queryAnalysis.push(searchMetrics);
    this.activeSessions.delete(searchId);
    this._trimHistory();
  }

  recordSearch(searchData) {
    const record = {
      timestamp: Date.now(),
      query: searchData.query,
      weights: searchData.weights,
      strategy: searchData.strategy,
      resultCount: searchData.resultCount,
      searchTime: searchData.searchTime,
      sessionId: searchData.sessionId
    };

    this.metrics.searches.push(record);
    this._trimHistory();
  }

  recordInteraction(sessionId, interaction) {
    const record = {
      timestamp: Date.now(),
      sessionId,
      type: interaction.type,
      position: interaction.position,
      documentId: interaction.documentId,
      value: interaction.value
    };

    if (interaction.type === 'click') {
      this.metrics.clickThroughs.push(record);
    } else if (interaction.type === 'dwell') {
      this.metrics.dwellTimes.push(record);
    }

    this._trimHistory();
  }

  analyzePerformance(timeWindow = '24h') {
    const windowMs = this._parseTimeWindow(timeWindow);
    const cutoff = Date.now() - windowMs;
    
    const recentSearches = this.metrics.searches.filter(s => s.timestamp >= cutoff);
    const recentClicks = this.metrics.clickThroughs.filter(c => c.timestamp >= cutoff);

    const totalSearches = recentSearches.length;
    const totalClicks = recentClicks.length;
    const overallCTR = totalSearches > 0 ? totalClicks / totalSearches : 0;

    return {
      timeWindow,
      totalSearches,
      overallMetrics: {
        overallCTR,
        avgSearchTime: recentSearches.reduce((sum, s) => sum + (s.searchTime || 0), 0) / totalSearches || 0
      },
      strategyBreakdown: this._analyzeStrategies(recentSearches),
      recommendations: this._generateRecommendations(recentSearches, recentClicks)
    };
  }

  _analyzeStrategies(searches) {
    const strategies = {};
    
    searches.forEach(search => {
      const strategy = search.strategy || 'unknown';
      if (!strategies[strategy]) {
        strategies[strategy] = {
          searches: 0,
          avgSearchTime: 0,
          weightDistribution: { lexical: [], semantic: [] }
        };
      }
      
      strategies[strategy].searches++;
      strategies[strategy].avgSearchTime += search.searchTime || 0;
      
      if (search.weights) {
        strategies[strategy].weightDistribution.lexical.push(search.weights.lexical || 0.5);
        strategies[strategy].weightDistribution.semantic.push(search.weights.semantic || 0.5);
      }
    });

    Object.keys(strategies).forEach(strategy => {
      const data = strategies[strategy];
      data.avgSearchTime = data.avgSearchTime / data.searches;
      const lexWeights = data.weightDistribution.lexical;
      const semWeights = data.weightDistribution.semantic;
      data.avgLexicalWeight = lexWeights.length > 0 ? lexWeights.reduce((a, b) => a + b, 0) / lexWeights.length : 0.5;
      data.avgSemanticWeight = semWeights.length > 0 ? semWeights.reduce((a, b) => a + b, 0) / semWeights.length : 0.5;
    });

    return strategies;
  }

  _generateRecommendations(searches, _clicks) {
    const recommendations = [];
    
    if (searches.length > 50) {
      const avgSearchTime = searches.reduce((sum, s) => sum + (s.searchTime || 0), 0) / searches.length;
      if (avgSearchTime > 500) {
        recommendations.push({
          type: 'performance',
          message: 'Average search time is high. Consider optimizing queries.',
          priority: 'medium'
        });
      }
    }

    return recommendations;
  }

  _parseTimeWindow(timeWindow) {
    const units = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    return units[timeWindow] || units['24h'];
  }

  _trimHistory() {
    const maxSize = this.options.maxHistorySize;
    
    Object.keys(this.metrics).forEach(metricType => {
      if (this.metrics[metricType].length > maxSize) {
        this.metrics[metricType] = this.metrics[metricType].slice(-maxSize);
      }
    });
  }
}

module.exports = PerformanceMonitor;