/**
 * RankOps — Groq LLM API Client
 * 
 * High-performance inference client with structured JSON output, timeout handling, and model fallback resilience.
 */

class GroqApiError extends Error {
  constructor(message, statusCode = 500, code = 'GROQ_API_ERROR', details = {}, title = 'Groq API Error') {
    super(message);
    this.name = 'GroqApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.title = title;
  }
}

const DEFAULT_MODELS = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant',
  'qwen/qwen3.6-27b',
  'openai/gpt-oss-120b',
  'groq/compound'
];

class GroqClient {
  /**
   * @param {Object} options
   * @param {string} [options.apiKey] - Groq API Key
   * @param {string} [options.baseUrl='https://api.groq.com/openai/v1']
   * @param {string} [options.defaultModel='openai/gpt-oss-120b']
   * @param {number} [options.timeoutMs=25000]
   * @param {Function} [options.fetchFn]
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GROQ_API_KEY || null;
    this.baseUrl = (options.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    this.defaultModel = options.defaultModel || 'openai/gpt-oss-120b';
    this.timeoutMs = options.timeoutMs || 25000;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Executes a chat completion request against Groq with model fallback.
   * 
   * @param {Object} params
   * @param {Array<{ role: string, content: string }>} params.messages
   * @param {string} [params.model]
   * @param {number} [params.temperature=0.1]
   * @param {number} [params.maxTokens=4000]
   * @param {boolean} [params.jsonMode=true]
   * @returns {Promise<{ content: string, parsedJson?: any, usage: any, model: string }>}
   */
  async chatCompletion(params = {}) {
    const apiKey = params.apiKey || this.apiKey;
    if (!apiKey) {
      throw new GroqApiError(
        'Groq API key is missing. Set GROQ_API_KEY environment variable or pass apiKey in options.',
        401,
        'MISSING_GROQ_API_KEY',
        {},
        'Missing Groq API Key'
      );
    }

    const {
      messages = [],
      model = this.defaultModel,
      temperature = 0.1,
      maxTokens = 4000,
      jsonMode = true
    } = params;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new GroqApiError(
        'Messages array cannot be empty.',
        400,
        'INVALID_MESSAGES',
        {},
        'Invalid Messages'
      );
    }

    // Prepare candidate models starting with requested model
    const candidateModels = [model, ...DEFAULT_MODELS.filter(m => m !== model)];
    let lastError = null;

    for (const currentModel of candidateModels) {
      const requestBody = {
        model: currentModel,
        messages,
        temperature,
        max_tokens: maxTokens
      };

      if (jsonMode) {
        requestBody.response_format = { type: 'json_object' };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'RankOps-AEO-Auditor/1.0'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        const rateLimitRemaining = response.headers?.get ? response.headers.get('x-ratelimit-remaining-tokens') : null;
        const retryAfter = response.headers?.get ? response.headers.get('retry-after') : null;

        if (!response.ok) {
          let errorBody = {};
          try {
            errorBody = typeof response.json === 'function' ? await response.json() : {};
          } catch (e) {}

          const errorMessage = errorBody.error?.message || response.statusText;

          // If model is not found (404) or decommissioned (400), try next candidate model
          if ((response.status === 404 || response.status === 400) && (/model/i.test(errorMessage) || /decommissioned/i.test(errorMessage))) {
            console.warn(`[RankOps] Model '${currentModel}' not available on Groq, trying fallback...`);
            lastError = new GroqApiError(errorMessage, response.status, 'MODEL_UNAVAILABLE', { details: errorBody });
            continue;
          }

          if (response.status === 429) {
            throw new GroqApiError(
              `Groq API rate limit exceeded.${retryAfter ? ` Retry after ${retryAfter}s.` : ''}`,
              429,
              'GROQ_RATE_LIMITED',
              { retryAfter, rateLimitRemaining, details: errorBody },
              'Rate Limit Exceeded'
            );
          }

          if (response.status === 401) {
            throw new GroqApiError(
              `Invalid or unauthorized Groq API key: ${errorMessage}`,
              401,
              'GROQ_UNAUTHORIZED',
              { details: errorBody },
              'Unauthorized'
            );
          }

          throw new GroqApiError(
            `Groq API error (${response.status}): ${errorMessage}`,
            response.status,
            'GROQ_API_ERROR',
            { details: errorBody },
            'Groq API Error'
          );
        }

        const data = typeof response.json === 'function' ? await response.json() : response;
        const choice = data.choices && data.choices[0];
        const rawContent = choice?.message?.content || '';

        let parsedJson = null;
        if (jsonMode && rawContent) {
          try {
            parsedJson = JSON.parse(rawContent);
          } catch (e) {
            const match = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match) {
              try {
                parsedJson = JSON.parse(match[1]);
              } catch (err2) {}
            }
          }
        }

        return {
          content: rawContent,
          parsedJson,
          usage: data.usage || {},
          model: data.model || currentModel
        };
      } catch (err) {
        if (err.name === 'AbortError') {
          throw new GroqApiError(
            `Groq API request timed out after ${this.timeoutMs}ms.`,
            504,
            'GROQ_TIMEOUT',
            {},
            'Gateway Timeout'
          );
        }
        if (err instanceof GroqApiError) {
          if (err.statusCode === 404 || err.code === 'MODEL_UNAVAILABLE') continue;
          throw err;
        }
        throw new GroqApiError(
          `Network error communicating with Groq API: ${err.message}`,
          502,
          'GROQ_BAD_GATEWAY',
          {},
          'Bad Gateway'
        );
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError || new GroqApiError('All candidate Groq models failed.', 500);
  }
}

module.exports = {
  GroqClient,
  GroqApiError,
  DEFAULT_MODELS
};
