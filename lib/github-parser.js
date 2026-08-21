/**
 * RankOps — GitHub URL Parser & Input Sanitizer
 * 
 * Strict extraction of owner and repository name with SSRF and host spoofing guardrails.
 */

class GitHubParserError extends Error {
  constructor(message, code = 'INVALID_GITHUB_URL') {
    super(message);
    this.name = 'GitHubParserError';
    this.code = code;
  }
}

/**
 * Validates a GitHub username/organization name.
 * Rules: 1-39 characters, alphanumeric and single hyphens, no consecutive hyphens, cannot start or end with a hyphen.
 */
function isValidOwner(owner) {
  if (!owner || typeof owner !== 'string') return false;
  if (owner.length < 1 || owner.length > 39) return false;
  if (owner.includes('--')) return false;
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(owner);
}

/**
 * Validates a GitHub repository name.
 * Rules: 1-100 characters, alphanumeric, hyphens, underscores, periods. Cannot be "." or "..".
 */
function isValidRepo(repo) {
  if (!repo || typeof repo !== 'string') return false;
  if (repo === '.' || repo === '..') return false;
  if (repo.length < 1 || repo.length > 100) return false;
  return /^[a-zA-Z0-9_.-]+$/.test(repo);
}

/**
 * Parses and decomposes an input string into owner, repo, and clean canonical URLs.
 * 
 * Supported patterns:
 * - https://github.com/owner/repo
 * - http://github.com/owner/repo/
 * - github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo/tree/feature/auth
 * - https://github.com/owner/repo/blob/master/README.md?tab=readme#license
 * - owner/repo
 * 
 * @param {string} rawInput 
 * @returns {{ owner: string, repo: string, fullName: string, canonicalUrl: string, explicitBranch?: string }}
 */
function parseGitHubUrl(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new GitHubParserError('Repository URL cannot be empty or non-string.', 'EMPTY_INPUT');
  }

  let input = rawInput.trim();
  if (!input) {
    throw new GitHubParserError('Repository URL cannot be empty whitespace.', 'EMPTY_INPUT');
  }

  // Length sanity limit to prevent DoS
  if (input.length > 500) {
    throw new GitHubParserError('Input URL exceeds maximum length of 500 characters.', 'URL_TOO_LONG');
  }

  // Protocol Safety Check
  if (/^(file|ftp|javascript|data|vbscript):/i.test(input)) {
    throw new GitHubParserError('Disallowed URL protocol scheme.', 'DISALLOWED_PROTOCOL');
  }

  // Strip query parameters and URL fragments (?ref=..., #readme)
  input = input.replace(/[?#].*$/, '');

  let owner = '';
  let repo = '';
  let explicitBranch = undefined;

  // 1. Check SSH Format: git@github.com:owner/repo(.git)
  const sshMatch = input.match(/^git@github\.com:([^\/]+)\/([^\/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    owner = sshMatch[1];
    repo = sshMatch[2];
  } else {
    // 2. Normalize Web URLs
    let clean = input.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '');

    // Enforce exact host matching (prevents evilgithub.com and attacker-github.com)
    if (clean.startsWith('github.com/')) {
      clean = clean.slice('github.com/'.length);
    } else if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts[0].includes('.')) {
        const host = parts[0].toLowerCase();
        if (host !== 'github.com' && host !== 'www.github.com' && host !== 'ssh.github.com') {
          throw new GitHubParserError(`Invalid repository host '${parts[0]}'. Only 'github.com' is supported.`, 'INVALID_HOST');
        }
        parts.shift();
        clean = parts.join('/');
      }
    }

    const segments = clean.split('/').filter(Boolean);
    if (segments.length < 2) {
      throw new GitHubParserError("URL must contain both repository owner and project name (e.g. 'owner/repo').", 'INCOMPLETE_URL');
    }

    owner = segments[0];
    repo = segments[1].replace(/\.git$/i, '');

    // Support multi-segment branch names (e.g. tree/feature/login)
    if (segments.length >= 4 && (segments[2] === 'tree' || segments[2] === 'blob')) {
      explicitBranch = segments.slice(3).join('/');
    }
  }

  // Validate Owner
  if (!isValidOwner(owner)) {
    throw new GitHubParserError(`Invalid GitHub username/organization '${owner}'.`, 'INVALID_OWNER');
  }

  // Validate Repo Name
  if (!isValidRepo(repo)) {
    throw new GitHubParserError(`Invalid GitHub repository name '${repo}'.`, 'INVALID_REPO');
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
    ...(explicitBranch ? { explicitBranch } : {})
  };
}

module.exports = {
  parseGitHubUrl,
  isValidOwner,
  isValidRepo,
  GitHubParserError
};
