/**
 * RankOps — GitHub REST API Client & Branch SHA Resolver
 * 
 * Resilient API integration with rate limit detection, timeouts, and error handling.
 */

const { parseGitHubUrl, GitHubParserError } = require('./github-parser');

class GitHubApiError extends Error {
  constructor(message, statusCode, code, details = {}, title = 'GitHub API Error') {
    super(message);
    this.name = 'GitHubApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.title = title;
  }
}

class GitHubClient {
  /**
   * @param {Object} options
   * @param {string} [options.token] - GitHub Personal Access Token or fine-grained PAT
   * @param {number} [options.timeoutMs=8000] - Request timeout in milliseconds
   * @param {string} [options.baseUrl='https://api.github.com']
   * @param {Function} [options.fetchFn] - Custom/mock fetch implementation
   */
  constructor(options = {}) {
    this.token = options.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
    this.timeoutMs = options.timeoutMs || 8000;
    this.baseUrl = (options.baseUrl || 'https://api.github.com').replace(/\/$/, '');
    this.fetchFn = options.fetchFn || globalThis.fetch;
  }

  /**
   * Builds request headers with authorization and required GitHub API headers.
   */
  _getHeaders() {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'RankOps-AEO-Auditor/1.0 (https://rankops.dev)'
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Executes a fetch request with timeout and error handling.
   * 
   * @param {string} endpoint 
   * @returns {Promise<any>}
   */
  async _fetch(endpoint) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: this._getHeaders(),
        signal: controller.signal
      });

      const rateLimitRemaining = response.headers?.get ? response.headers.get('x-ratelimit-remaining') : null;
      const rateLimitReset = response.headers?.get ? response.headers.get('x-ratelimit-reset') : null;
      const retryAfter = response.headers?.get ? response.headers.get('retry-after') : null;

      if (!response.ok) {
        let errorBody = {};
        try {
          errorBody = typeof response.json === 'function' ? await response.json() : {};
        } catch (e) {}

        const message = errorBody.message || response.statusText;

        if (response.status === 404) {
          throw new GitHubApiError(
            `Repository or resource '${endpoint}' not found or access is restricted.`,
            404,
            'REPO_NOT_FOUND',
            { endpoint },
            'Repository Not Found'
          );
        }

        // Strict rate limit detection
        const isRateLimit = response.status === 429 || 
          (response.status === 403 && (rateLimitRemaining === '0' || /rate limit/i.test(message)));

        if (isRateLimit) {
          let resetSeconds = null;
          if (retryAfter) {
            resetSeconds = parseInt(retryAfter, 10);
          } else if (rateLimitReset) {
            const resetTime = parseInt(rateLimitReset, 10) * 1000;
            resetSeconds = Math.max(0, Math.ceil((resetTime - Date.now()) / 1000));
          }

          throw new GitHubApiError(
            `GitHub API rate limit exceeded.${resetSeconds !== null ? ` Resets in ${resetSeconds}s.` : ''}`,
            429,
            'RATE_LIMITED',
            {
              remaining: rateLimitRemaining,
              resetAt: rateLimitReset ? new Date(parseInt(rateLimitReset, 10) * 1000).toISOString() : null,
              resetSeconds
            },
            'Rate Limit Exceeded'
          );
        }

        if (response.status === 403) {
          throw new GitHubApiError(
            `Access to repository '${endpoint}' is forbidden. Check token permissions or SAML authorization.`,
            403,
            'FORBIDDEN',
            { details: errorBody },
            'Forbidden'
          );
        }

        if (response.status === 401) {
          throw new GitHubApiError(
            `Unauthorized GitHub token. Please verify configured credentials.`,
            401,
            'UNAUTHORIZED',
            { details: errorBody },
            'Unauthorized'
          );
        }

        if (response.status === 451) {
          throw new GitHubApiError(
            `Repository is unavailable due to legal or DMCA reasons.`,
            451,
            'UNAVAILABLE_FOR_LEGAL_REASONS',
            { details: errorBody },
            'Unavailable For Legal Reasons'
          );
        }

        throw new GitHubApiError(
          `GitHub API error (${response.status}): ${message}`,
          response.status,
          'GITHUB_API_ERROR',
          { details: errorBody },
          'GitHub API Error'
        );
      }

      return typeof response.json === 'function' ? await response.json() : response;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new GitHubApiError(
          `GitHub API request timed out after ${this.timeoutMs}ms.`,
          504,
          'GATEWAY_TIMEOUT',
          {},
          'Gateway Timeout'
        );
      }
      if (err instanceof GitHubApiError) {
        throw err;
      }
      throw new GitHubApiError(
        `Network error communicating with GitHub API: ${err.message}`,
        502,
        'BAD_GATEWAY',
        {},
        'Bad Gateway'
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetches basic repository metadata.
   * 
   * @param {string} owner 
   * @param {string} repo 
   * @returns {Promise<any>}
   */
  async getRepository(owner, repo) {
    return await this._fetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  /**
   * Fetches branch information and resolves the latest commit SHA and root tree SHA.
   * 
   * @param {string} owner 
   * @param {string} repo 
   * @param {string} branch 
   * @returns {Promise<{ branchName: string, commitSha: string, treeSha: string }>}
   */
  async getBranchSha(owner, repo, branch) {
    try {
      const branchData = await this._fetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`
      );

      const commitSha = branchData.commit?.sha;
      const treeSha = branchData.commit?.commit?.tree?.sha;

      if (!commitSha) {
        throw new GitHubApiError(
          `Unable to resolve commit SHA for branch '${branch}'. The repository is empty.`,
          422,
          'EMPTY_REPOSITORY',
          {},
          'Empty Repository'
        );
      }

      return {
        branchName: branch,
        commitSha,
        treeSha: treeSha || commitSha
      };
    } catch (err) {
      if (err instanceof GitHubApiError && err.statusCode === 404) {
        // If branch returns 404, check if repo is empty or branch does not exist
        throw new GitHubApiError(
          `Branch '${branch}' was not found in repository. The repository may be empty (0 commits) or the branch was deleted.`,
          422,
          'EMPTY_REPOSITORY',
          { branch },
          'Branch Not Found / Empty Repository'
        );
      }
      throw err;
    }
  }

  /**
   * Full Phase 1 Pipeline:
   * 1. Parses and validates the target URL string.
   * 2. Queries GitHub API for repo metadata and default branch.
   * 3. Resolves the branch's commit SHA and root tree SHA reference.
   * 
   * @param {string} rawUrl 
   * @returns {Promise<{
   *   owner: string,
   *   repo: string,
   *   fullName: string,
   *   canonicalUrl: string,
   *   defaultBranch: string,
   *   commitSha: string,
   *   treeSha: string,
   *   isPrivate: boolean,
   *   visibility: string,
   *   description: string|null,
   *   stars: number,
   *   language: string|null,
   *   topics: string[]
   * }>}
   */
  async resolveRepository(rawUrl) {
    // Step 1: Regex & URL extraction
    const parsed = parseGitHubUrl(rawUrl);

    // Step 2: Fetch Repo details
    const repoMeta = await this.getRepository(parsed.owner, parsed.repo);

    if (repoMeta.size === 0) {
      console.warn(`[RankOps] Warning: Repository ${parsed.fullName} has size 0.`);
    }

    const targetBranch = parsed.explicitBranch || repoMeta.default_branch || 'main';

    // Step 3: Fetch Branch SHA
    const branchInfo = await this.getBranchSha(parsed.owner, parsed.repo, targetBranch);

    return {
      owner: repoMeta.owner?.login || parsed.owner,
      repo: repoMeta.name || parsed.repo,
      fullName: repoMeta.full_name || parsed.fullName,
      canonicalUrl: repoMeta.html_url || parsed.canonicalUrl,
      defaultBranch: branchInfo.branchName,
      commitSha: branchInfo.commitSha,
      treeSha: branchInfo.treeSha,
      isPrivate: repoMeta.private || false,
      visibility: repoMeta.visibility || (repoMeta.private ? 'private' : 'public'),
      description: repoMeta.description || null,
      stars: repoMeta.stargazers_count || 0,
      language: repoMeta.language || null,
      topics: repoMeta.topics || []
    };
  }
}

module.exports = {
  GitHubClient,
  GitHubApiError
};
