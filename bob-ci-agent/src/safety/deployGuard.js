/**
 * src/safety/deployGuard.js
 * =========================
 * Standalone Deployment Safety Guard
 * 
 * Prevents dangerous CLI deployment or mutation commands unless release readiness
 * has passed.
 */

'use strict';

const BLOCKED_PATTERNS = [
  /kubectl\s+apply/i,
  /kubectl\s+create/i,
  /kubectl\s+delete/i,
  /helm\s+upgrade/i,
  /helm\s+install/i,
  /git\s+push\s+.*\b(main|staging|production|prod)\b/i,
  /git\s+push\s+--force/i,
  /docker\s+push/i,
  /ibmcloud\s+ce\s+app\s+update/i,
];

const ALLOWED_PATTERNS = [
  /kubectl\s+get/i,
  /kubectl\s+describe/i,
  /kubectl\s+logs/i,
  /kubectl\s+rollout\s+status/i,
];

/**
 * Validates a command against deployment safety policies.
 * @param {string} command 
 * @param {object} [releaseReadinessResult] - Optional result from check_release_readiness
 * @returns {{ allowed: boolean, reason?: string, requiresGate: boolean }}
 */
function validateDeployCommand(command, releaseReadinessResult = null) {
  if (!command || typeof command !== 'string') {
    return { allowed: true, requiresGate: false };
  }

  // Allow safe read-only commands
  if (ALLOWED_PATTERNS.some(p => p.test(command))) {
    return { allowed: true, requiresGate: false };
  }

  // Check if command is a dangerous deployment command
  const blockedPattern = BLOCKED_PATTERNS.find(p => p.test(command));
  if (blockedPattern) {
    if (releaseReadinessResult && releaseReadinessResult.overall === 'PASS') {
      return { allowed: true, requiresGate: true };
    }

    return {
      allowed: false,
      requiresGate: true,
      reason: `Deploy command "${command}" blocked. Deployment requires a PASS from check_release_readiness first.` +
        (releaseReadinessResult ? ` Current readiness status: ${releaseReadinessResult.overall}.` : ''),
    };
  }

  return { allowed: true, requiresGate: false };
}

module.exports = { validateDeployCommand, BLOCKED_PATTERNS, ALLOWED_PATTERNS };
