/**
 * Simplified QueryBuilder - Only essential functionality for hybrid search
 */

class QueryBuilder {
  constructor(queryTemplates, options = {}) {
    this.queryTemplates = queryTemplates || {};
    this.options = {
      defaultInferenceId: 'my-elser-model',
      ...options
    };
  }

  /**
   * Build hybrid query using mustache templates
   */
  buildHybridQuery(query, weights, useRerank = true, inferenceId = null) {
    const lexicalWeight = weights.lexicalWeight * 10;
    const semanticWeight = weights.semanticWeight * 10;

    // Choose the appropriate query template
    const template = useRerank ? this.queryTemplates.rerank : this.queryTemplates.noRerank;
    
    if (!template) {
      throw new Error(`Query template not found for useRerank: ${useRerank}`);
    }
    
    // Use provided inferenceId or fallback to default
    const finalInferenceId = inferenceId || this.options.defaultInferenceId;
    
    // Replace mustache variables in the query template
    const queryString = this._replaceTemplateVariables(template, {
      query: query,
      lexical_weight: lexicalWeight,
      semantic_weight: semanticWeight,
      inference_id: finalInferenceId
    });

    try {
      return JSON.parse(queryString);
    } catch (error) {
      throw new Error(`Failed to parse query template: ${error.message}`);
    }
  }

  /**
   * Replace mustache-style template variables
   * @private
   */
  _replaceTemplateVariables(template, variables) {
    let result = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, value);
    }
    
    return result;
  }

  /**
   * Update configuration options
   */
  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
  }
}

module.exports = QueryBuilder;