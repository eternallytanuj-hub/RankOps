/**
 * RankOps — Groq LLM API Client
 * 
 * High-performance inference client with multi-key fallback,
 * structured JSON output, timeout handling, and model fallback resilience.
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
   * @param {string} [options.apiKey] - Primary Groq API Key
   * @param {string} [options.fallbackApiKey] - Fallback Groq API Key
   * @param {string} [options.baseUrl='https://api.groq.com/openai/v1']
   * @param {string} [options.defaultModel='llama-3.3-70b-versatile']
   * @param {number} [options.timeoutMs=25000]
   * @param {Function} [options.fetchFn]
   */
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GROQ_API_KEY || null;
    this.fallbackApiKey = options.fallbackApiKey ||
      process.env.FALL_BACK_GROQ_API_KEY ||
      process.env.FALLBACK_GROQ_API_KEY ||
      process.env.GROQ_FALLBACK_API_KEY ||
      null;
    this.baseUrl = (options.baseUrl || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    this.defaultModel = options.defaultModel || 'llama-3.3-70b-versatile';
    this.timeoutMs = options.timeoutMs || 25000;
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Returns an array of available API keys in priority order (primary -> fallbacks).
   */
  getApiKeys(passedKey = null) {
    const keys = [];
    if (passedKey) keys.push(passedKey);
    if (this.apiKey && !keys.includes(this.apiKey)) keys.push(this.apiKey);

    const fallbackKeys = [
      this.fallbackApiKey,
      process.env.FALL_BACK_GROQ_API_KEY,
      process.env.FALLBACK_GROQ_API_KEY,
      process.env.GROQ_FALLBACK_API_KEY
    ].filter(Boolean);

    for (const fbKey of fallbackKeys) {
      if (fbKey && !keys.includes(fbKey)) {
        keys.push(fbKey);
      }
    }

    return keys;
  }

  /**
   * Executes a chat completion request against Groq with multi-key and model fallback.
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
    const candidateKeys = this.getApiKeys(params.apiKey);
    if (candidateKeys.length === 0) {
      throw new GroqApiError(
        'Groq API key is missing. Set GROQ_API_KEY or FALL_BACK_GROQ_API_KEY environment variable or pass apiKey in options.',
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

    const candidateModels = [model, ...DEFAULT_MODELS.filter(m => m !== model)];
    let lastError = null;

    for (let keyIdx = 0; keyIdx < candidateKeys.length; keyIdx++) {
      const activeKey = candidateKeys[keyIdx];
      const isFallbackKey = keyIdx > 0;

      if (isFallbackKey) {
        console.log(`[RankOps] Using fallback Groq API key (Key #${keyIdx + 1})...`);
      }

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
              'Authorization': `Bearer ${activeKey}`,
              'User-Agent': 'RankOps-AEO-Auditor/1.0'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const retryAfter = response.headers?.get ? response.headers.get('retry-after') : null;
          const rateLimitRemaining = response.headers?.get ? response.headers.get('x-ratelimit-remaining-tokens') : null;

          if (!response.ok) {
            let errorBody = {};
            try {
              errorBody = typeof response.json === 'function' ? await response.json() : {};
            } catch (e) {}

            const errorMessage = errorBody.error?.message || response.statusText;

            // Model not found / decommissioned on Groq -> try next model
            if ((response.status === 404 || response.status === 400) && (/model/i.test(errorMessage) || /decommissioned/i.test(errorMessage))) {
              console.warn(`[RankOps] Model '${currentModel}' not available on Groq, trying next model...`);
              lastError = new GroqApiError(errorMessage, response.status, 'MODEL_UNAVAILABLE', { details: errorBody });
              continue;
            }

            // Rate Limit (429) or Request size / TPM limit (413) -> switch key or model
            if (response.status === 429 || response.status === 413) {
              console.warn(`[RankOps] Groq key #${keyIdx + 1} rate/quota limited (${response.status}: ${errorMessage}). Trying next key/model...`);
              lastError = new GroqApiError(
                `Groq API rate/quota limit (${response.status}): ${errorMessage}`,
                response.status,
                'GROQ_RATE_LIMITED',
                { retryAfter, rateLimitRemaining, details: errorBody }
              );
              // Break inner loop to try next API key in candidateKeys
              break;
            }

            // Unauthorized / Invalid Key (401) -> try next API key
            if (response.status === 401) {
              console.warn(`[RankOps] Groq key #${keyIdx + 1} unauthorized. Trying fallback key...`);
              lastError = new GroqApiError(
                `Invalid Groq API key: ${errorMessage}`,
                401,
                'GROQ_UNAUTHORIZED',
                { details: errorBody }
              );
              break;
            }

            // Other 5xx or server errors
            lastError = new GroqApiError(
              `Groq API error (${response.status}): ${errorMessage}`,
              response.status,
              'GROQ_API_ERROR',
              { details: errorBody }
            );
            continue;
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
            model: data.model || currentModel,
            keyIndexUsed: keyIdx
          };
        } catch (err) {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') {
            lastError = new GroqApiError(
              `Groq API request timed out after ${this.timeoutMs}ms.`,
              504,
              'GROQ_TIMEOUT'
            );
            continue;
          }
          if (err instanceof GroqApiError) {
            lastError = err;
            continue;
          }
          lastError = new GroqApiError(err.message, 500, 'GROQ_NETWORK_ERROR');
        }
      }
    }

    throw lastError || new GroqApiError('All Groq API keys and candidate models exhausted.', 500, 'GROQ_ALL_EXHAUSTED');
  }
}

module.exports = {
  GroqClient,
  GroqApiError,
  DEFAULT_MODELS
};
