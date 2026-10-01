/**
 * src/safety/promptGate.js
 * ========================
 * Standalone Prompt Safety Middleware
 * 
 * Inspects user prompts for dangerous or unauthorized operation patterns
 * (e.g. direct production deploy, skipping deploy guard, force pushing to main).
 */

'use strict';

const BLOCKED_PROMPT_PATTERNS = [
  { pattern: /deploy\s+to\s+prod(uction)?/i,    reason: 'Direct production deploys are not permitted. Use the triage + release readiness flow.' },
  { pattern: /skip\s+the\s+(deploy\s+)?guard/i, reason: 'The deploy guard cannot be bypassed. Run check_release_readiness first.' },
  { pattern: /ignore\s+(coverage|tests)/i,       reason: 'Coverage and test gates are required. Cannot ignore them.' },
  { pattern: /force\s+push\s+to\s+main/i,        reason: 'Force pushing to main is blocked. Use a PR.' },
];

/**
 * Validates a user prompt against safety rules.
 * @param {string} prompt 
 * @returns {{ allowed: boolean, reason?: string }}
 */
function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { allowed: true };
  }

  const blocked = BLOCKED_PROMPT_PATTERNS.find(({ pattern }) => pattern.test(prompt));
  if (blocked) {
    return {
      allowed: false,
      reason: blocked.reason,
    };
  }

  return { allowed: true };
}

module.exports = { validatePrompt, BLOCKED_PROMPT_PATTERNS };
