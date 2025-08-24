/**
 * QueryBuilder - Elasticsearch query construction for hybrid search
 * Handles building complex queries with mustache template substitution
 */

class QueryBuilder {
  constructor(queryTemplates, options = {}) {
    this.queryTemplates = queryTemplates;
    this.options = {
      defaultInferenceId: '.rerank-v1-elasticsearch',
      ...options
    };
  }

  /**
   * Build hybrid query from template and weights
   * @param {string} query - The search query
   * @param {object} weights - Weight configuration
   * @param {boolean} useRerank - Whether to use reranking
   * @returns {object} Elasticsearch query object
   */
  buildHybridQuery(query, weights, useRerank = true) {
    const lexicalWeight = weights.lexicalWeight * 10;
    const semanticWeight = weights.semanticWeight * 10;

    // Choose the appropriate query template
    const template = useRerank ? this.queryTemplates.rerank : this.queryTemplates.noRerank;
    
    if (!template) {
      throw new Error(`Query template not found for useRerank: ${useRerank}`);
    }
    
    // Replace mustache variables in the query template
    const queryString = this._replaceTemplateVariables(template, {
      query: query,
      lexical_weight: lexicalWeight,
      semantic_weight: semanticWeight,
      inference_id: this.options.defaultInferenceId
    });

    try {
      return JSON.parse(queryString);
    } catch (error) {
      throw new Error(`Failed to parse query template: ${error.message}`);
    }
  }

  /**
   * Build a simple lexical query (for fallback scenarios)
   * @param {string} query - The search query
   * @param {object} options - Query options
   * @returns {object} Elasticsearch query object
   */
  buildLexicalQuery(query, options = {}) {
    const {
      size = 20,
      indices = ['*'],
      fields = ['unified_title^2', 'unified_content', 'unified_description']
    } = options;

    return {
      size: size,
      query: {
        bool: {
          should: [
            {
              multi_match: {
                query: query,
                fields: fields,
                type: 'best_fields',
                fuzziness: 'AUTO'
              }
            }
          ]
        }
      },
      highlight: {
        fields: {
          'unified_title': {},
          'unified_content': { fragment_size: 150, number_of_fragments: 3 },
          'unified_description': {}
        }
      }
    };
  }

  /**
   * Build a simple semantic query (for fallback scenarios)
   * @param {string} query - The search query
   * @param {Array} queryVector - The query embedding vector
   * @param {object} options - Query options
   * @returns {object} Elasticsearch query object
   */
  buildSemanticQuery(query, queryVector, options = {}) {
    const {
      size = 20,
      indices = ['*'],
      vectorField = 'embedding_vector',
      k = 100
    } = options;

    if (!queryVector || !Array.isArray(queryVector)) {
      throw new Error('Query vector is required for semantic search');
    }

    return {
      size: size,
      query: {
        knn: {
          field: vectorField,
          query_vector: queryVector,
          k: k,
          num_candidates: k * 2
        }
      },
      highlight: {
        fields: {
          'unified_title': {},
          'unified_content': { fragment_size: 150, number_of_fragments: 3 },
          'unified_description': {}
        }
      }
    };
  }

  /**
   * Build a filtered query with additional constraints
   * @param {object} baseQuery - Base Elasticsearch query
   * @param {object} filters - Filter configuration
   * @returns {object} Enhanced query with filters
   */
  buildFilteredQuery(baseQuery, filters = {}) {
    const {
      categories = [],
      dateRange = null,
      authors = [],
      indices = []
    } = filters;

    if (!categories.length && !dateRange && !authors.length && !indices.length) {
      return baseQuery;
    }

    // Clone the base query
    const filteredQuery = JSON.parse(JSON.stringify(baseQuery));

    // Wrap the existing query in a bool filter
    const existingQuery = filteredQuery.query;
    filteredQuery.query = {
      bool: {
        must: [existingQuery],
        filter: []
      }
    };

    // Add category filters
    if (categories.length > 0) {
      filteredQuery.query.bool.filter.push({
        terms: { '_index': categories }
      });
    }

    // Add date range filter
    if (dateRange) {
      filteredQuery.query.bool.filter.push({
        range: {
          'unified_date': {
            gte: dateRange.from,
            lte: dateRange.to
          }
        }
      });
    }

    // Add author filters
    if (authors.length > 0) {
      filteredQuery.query.bool.filter.push({
        terms: { 'unified_author.keyword': authors }
      });
    }

    return filteredQuery;
  }

  /**
   * Replace mustache-style variables in template
   * @private
   */
  _replaceTemplateVariables(template, variables) {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }
    
    return result;
  }

  /**
   * Validate query template
   * @param {string} template - Query template string
   * @returns {boolean} Whether template is valid
   */
  validateTemplate(template) {
    try {
      // Try to parse as JSON (after replacing variables with dummy values)
      const dummyVars = {
        query: 'test',
        lexical_weight: 5,
        semantic_weight: 5,
        inference_id: 'test'
      };
      
      const testQuery = this._replaceTemplateVariables(template, dummyVars);
      JSON.parse(testQuery);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract template variables from a template string
   * @param {string} template - Query template string
   * @returns {Array<string>} Array of variable names found
   */
  extractTemplateVariables(template) {
    const regex = /{{(\w+)}}/g;
    const variables = [];
    let match;
    
    while ((match = regex.exec(template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }
    
    return variables;
  }

  /**
   * Update query templates
   * @param {object} newTemplates - New template configuration
   */
  updateTemplates(newTemplates) {
    this.queryTemplates = { ...this.queryTemplates, ...newTemplates };
  }

  /**
   * Update options
   * @param {object} newOptions - New options to merge
   */
  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Get available templates
   * @returns {object} Available templates
   */
  getTemplates() {
    return { ...this.queryTemplates };
  }

  /**
   * Get current options
   * @returns {object} Current options
   */
  getOptions() {
    return { ...this.options };
  }

  /**
   * Create a query explain request (for debugging)
   * @param {object} query - Elasticsearch query
   * @param {string} docId - Document ID to explain
   * @returns {object} Explain query object
   */
  buildExplainQuery(query, docId) {
    return {
      query: query.query,
      explain: true,
      _source: false
    };
  }

  /**
   * Build aggregation query for analytics
   * @param {string} query - Search query
   * @param {object} aggregations - Aggregation configuration
   * @returns {object} Query with aggregations
   */
  buildAggregationQuery(query, aggregations = {}) {
    const baseQuery = this.buildLexicalQuery(query, { size: 0 });
    
    const defaultAggs = {
      categories: {
        terms: { field: '_index', size: 20 }
      },
      authors: {
        terms: { field: 'unified_author.keyword', size: 20 }
      },
      date_histogram: {
        date_histogram: {
          field: 'unified_date',
          calendar_interval: 'month'
        }
      }
    };

    baseQuery.aggs = { ...defaultAggs, ...aggregations };
    return baseQuery;
  }
}

module.exports = QueryBuilder;