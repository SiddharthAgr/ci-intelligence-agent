/**
 * src/safety/index.js
 * ===================
 * Standalone Safety Middleware Index
 */

'use strict';

const { validatePrompt, BLOCKED_PROMPT_PATTERNS } = require('./promptGate');
const { validateDeployCommand, BLOCKED_PATTERNS, ALLOWED_PATTERNS } = require('./deployGuard');

module.exports = {
  validatePrompt,
  BLOCKED_PROMPT_PATTERNS,
  validateDeployCommand,
  BLOCKED_PATTERNS,
  ALLOWED_PATTERNS,
};
