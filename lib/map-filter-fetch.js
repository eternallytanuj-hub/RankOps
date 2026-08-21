/**
 * RankOps — Phase 2: Map-Filter-Fetch Pipeline
 * 
 * Surgical zero-clone GitHub repository scanning that fetches only SEO/AEO-relevant artifacts.
 */

const { GitHubClient, GitHubApiError } = require('./github-client');

class MapFilterFetchError extends Error {
  constructor(message, code = 'PIPELINE_ERROR', statusCode = 500, details = {}, title = 'Pipeline Error') {
    super(message);
    this.name = 'MapFilterFetchError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.title = title;
  }
}

// Canonical SEO & AEO Target Matching Rules
const ARTIFACT_RULES = [
  {
    category: 'robots',
    label: 'Robots.txt Specification',
    regex: /(?:^|\/)(?:public\/|static\/)?robots\.txt$/i
  },
  {
    category: 'sitemap',
    label: 'XML Sitemap',
    regex: /(?:^|\/)(?:public\/|static\/|src\/)?sitemap(?:_index)?\.xml$/i
  },
  {
    category: 'llms_txt',
    label: 'LLM Context Specification (llms.txt)',
    regex: /(?:^|\/)(?:\.well-known\/|public\/)?llms(?:-full)?\.txt$/i
  },
  {
    category: 'html_layout',
    label: 'HTML Document / App Shell',
    regex: /(?:^|\/)(?:public\/|src\/)?index\.html$/i
  },
  {
    category: 'framework_layout',
    label: 'Modern Framework Root Layout (Meta / Head)',
    regex: /(?:^|\/)(?:src\/)?(?:app\/layout\.(?:tsx|jsx|js)|pages\/_document\.(?:tsx|jsx|js)|pages\/_app\.(?:tsx|jsx|js)|pages\/index\.(?:tsx|jsx|js)|src\/App\.(?:tsx|jsx|js)|src\/main\.(?:tsx|jsx|js)|index\.php)$/i
  },
  {
    category: 'schema_metadata',
    label: 'Structured Data Schema / Config',
    regex: /(?:^|\/)(?:schema\.json|next\.config\.(?:js|mjs|ts)|astro\.config\.(?:mjs|ts)|nuxt\.config\.(?:ts|js))$/i
  }
];

class MapFilterFetchPipeline {
  /**
   * @param {Object} options
   * @param {GitHubClient} [options.client]
   * @param {number} [options.maxFileSize=512000] - 500KB max per file
   * @param {number} [options.concurrency=5] - Max concurrent blob fetches
   */
  constructor(options = {}) {
    this.client = options.client || new GitHubClient(options);
    this.maxFileSize = options.maxFileSize || 512000;
    this.concurrency = options.concurrency || 5;
  }

  /**
   * MAP STEP: Retrieves the recursive Git tree representation from GitHub API.
   * 
   * @param {string} owner 
   * @param {string} repo 
   * @param {string} treeSha 
   * @returns {Promise<{ tree: Array<{ path: string, mode: string, type: string, sha: string, size?: number }>, truncated: boolean }>}
   */
  async mapTree(owner, repo, treeSha) {
    if (!owner || !repo || !treeSha) {
      throw new MapFilterFetchError(
        'Missing required parameters (owner, repo, treeSha) for Map step.',
        'INVALID_MAP_PARAMS',
        400,
        { owner, repo, treeSha },
        'Invalid Map Parameters'
      );
    }

    try {
      const data = await this.client._fetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`
      );

      return {
        tree: data.tree || [],
        truncated: Boolean(data.truncated)
      };
    } catch (err) {
      if (err instanceof GitHubApiError) {
        throw new MapFilterFetchError(
          `Failed to map repository tree: ${err.message}`,
          err.code,
          err.statusCode,
          err.details,
          err.title
        );
      }
      throw new MapFilterFetchError(
        `Unexpected error mapping repository tree: ${err.message}`,
        'MAP_FAILED',
        500
      );
    }
  }

  /**
   * FILTER STEP: Scans tree elements to isolate SEO/AEO files based on heuristics.
   * 
   * @param {Array<any>} tree 
   * @param {Object} [options]
   * @param {string[]} [options.enabledCategories]
   * @returns {Array<{ path: string, sha: string, size?: number, category: string, label: string }>}
   */
  filterArtifacts(tree, options = {}) {
    if (!Array.isArray(tree)) return [];

    const enabledCategories = options.enabledCategories || null;
    const matchedFiles = [];
    const seenPaths = new Set();

    // Iterate through tree
    for (const item of tree) {
      if (item.type !== 'blob' || !item.path) continue;

      // Ignore dependencies, build outputs, and vendor folders
      if (/^(?:node_modules|\.git|\.next|dist|build|vendor|coverage)\//i.test(item.path)) {
        continue;
      }

      for (const rule of ARTIFACT_RULES) {
        if (enabledCategories && !enabledCategories.includes(rule.category)) {
          continue;
        }

        if (rule.regex.test(item.path)) {
          if (!seenPaths.has(item.path)) {
            seenPaths.add(item.path);
            matchedFiles.push({
              path: item.path,
              sha: item.sha,
              size: item.size || 0,
              category: rule.category,
              label: rule.label
            });
          }
          break;
        }
      }
    }

    return matchedFiles;
  }

  /**
   * FETCH STEP: Retrieves base64 blob contents and decodes into clean UTF-8 text.
   * 
   * @param {string} owner 
   * @param {string} repo 
   * @param {Array<{ path: string, sha: string, category: string, label: string, size?: number }>} targetFiles 
   * @returns {Promise<Array<{ path: string, sha: string, category: string, label: string, content: string, byteSize: number, estimatedTokens: number }>>}
   */
  async fetchBlobs(owner, repo, targetFiles) {
    if (!Array.isArray(targetFiles) || targetFiles.length === 0) {
      return [];
    }

    const results = [];
    const queue = [...targetFiles];

    // Controlled concurrent worker pool
    const runWorker = async () => {
      while (queue.length > 0) {
        const file = queue.shift();
        if (!file) break;

        try {
          const blobData = await this.client._fetch(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(file.sha)}`
          );

          let rawContent = '';
          if (blobData.encoding === 'base64' && blobData.content) {
            rawContent = Buffer.from(blobData.content.replace(/\s/g, ''), 'base64').toString('utf8');
          } else if (typeof blobData.content === 'string') {
            rawContent = blobData.content;
          }

          // Check size guard
          const byteSize = Buffer.byteLength(rawContent, 'utf8');
          let content = rawContent;
          if (byteSize > this.maxFileSize) {
            content = rawContent.slice(0, this.maxFileSize) + '\n\n/* [RankOps: Content truncated at 500KB] */';
          }

          const estimatedTokens = Math.ceil(content.length / 4);

          results.push({
            path: file.path,
            sha: file.sha,
            category: file.category,
            label: file.label,
            content,
            byteSize,
            estimatedTokens
          });
        } catch (err) {
          console.warn(`[RankOps] Warning: Failed to fetch blob for ${file.path} (${file.sha}):`, err.message);
          results.push({
            path: file.path,
            sha: file.sha,
            category: file.category,
            label: file.label,
            content: '',
            byteSize: 0,
            estimatedTokens: 0,
            error: err.message
          });
        }
      }
    };

    const workers = Array(Math.min(this.concurrency, targetFiles.length))
      .fill(null)
      .map(() => runWorker());

    await Promise.all(workers);
    return results;
  }

  /**
   * Calculates token and bandwidth savings metrics.
   */
  calculateSavings(totalTreeFiles, totalTreeBytes, fetchedFiles) {
    const fetchedCount = fetchedFiles.length;
    const fetchedBytes = fetchedFiles.reduce((acc, f) => acc + (f.byteSize || 0), 0);
    const fetchedTokens = fetchedFiles.reduce((acc, f) => acc + (f.estimatedTokens || 0), 0);

    // Conservative estimate: average repo code file is 6KB (~1500 tokens)
    const estimatedTotalRepoBytes = Math.max(totalTreeBytes || (totalTreeFiles * 6000), fetchedBytes);
    const estimatedTotalRepoTokens = Math.ceil(estimatedTotalRepoBytes / 4);

    const tokenSavingsPercent = estimatedTotalRepoTokens > 0
      ? Number((((estimatedTotalRepoTokens - fetchedTokens) / estimatedTotalRepoTokens) * 100).toFixed(1))
      : 95.0;

    const fileSavingsPercent = totalTreeFiles > 0
      ? Number((((totalTreeFiles - fetchedCount) / totalTreeFiles) * 100).toFixed(1))
      : 90.0;

    return {
      totalFilesScanned: totalTreeFiles,
      targetFilesIsolated: fetchedCount,
      totalEstimatedTokens: estimatedTotalRepoTokens,
      consumedTokens: fetchedTokens,
      tokenSavingsPercent: Math.max(0, tokenSavingsPercent),
      fileSavingsPercent: Math.max(0, fileSavingsPercent)
    };
  }

  /**
   * Full Phase 2 Execution Orchestrator:
   * 1. Map: pulls recursive Git tree from tree SHA.
   * 2. Filter: identifies all SEO/AEO files.
   * 3. Fetch: retrieves and decodes base64 blobs into UTF-8.
   * 4. Calculates token metrics.
   */
  async execute(owner, repo, treeSha, options = {}) {
    // Step 1: Map Tree
    const mapResult = await this.mapTree(owner, repo, treeSha);

    // Compute approximate tree bytes
    const totalTreeBytes = mapResult.tree.reduce((acc, item) => acc + (item.size || 0), 0);

    // Step 2: Filter Artifacts
    const filteredFiles = this.filterArtifacts(mapResult.tree, options);

    // Step 3: Fetch Blobs
    const fetchedBlobs = await this.fetchBlobs(owner, repo, filteredFiles);

    // Step 4: Metrics
    const metrics = this.calculateSavings(mapResult.tree.length, totalTreeBytes, fetchedBlobs);

    return {
      owner,
      repo,
      treeSha,
      isTruncated: mapResult.truncated,
      artifacts: fetchedBlobs,
      metrics
    };
  }
}

module.exports = {
  MapFilterFetchPipeline,
  MapFilterFetchError,
  ARTIFACT_RULES
};
