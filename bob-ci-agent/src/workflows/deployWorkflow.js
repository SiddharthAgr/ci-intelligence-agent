/**
 * src/workflows/deployWorkflow.js
 * ================================
 * Independent Deployment Safety Workflow
 * 
 * Flow:
 *   1. Accept deployment command and git ref
 *   2. Run safety guard check
 *   3. Run release readiness gate check via MCPClient
 *   4. Return decision (allowed / blocked with reason)
 */

'use strict';

const { validateDeployCommand } = require('../safety/deployGuard');

/**
 * Evaluates deployment request safety and gate readiness.
 * @param {object} params
 * @param {string} params.command
 * @param {string} params.ref
 * @param {string} [params.targetEnv="staging"]
 * @param {import('../mcp/mcpClient').MCPClient} params.mcpClient
 * @returns {Promise<object>} Deployment evaluation result
 */
async function executeDeployWorkflow({ command, ref, targetEnv = 'staging', mcpClient }) {
  if (!command) throw new Error('deployWorkflow: "command" is required');

  // Check release readiness if ref and mcpClient provided
  let readinessResult = null;
  if (ref && mcpClient) {
    readinessResult = await mcpClient.callTool('check_release_readiness', {
      ref,
      target_env: targetEnv,
    });
  }

  // Validate command against safety policy and release status
  const guard = validateDeployCommand(command, readinessResult);

  return {
    command,
    ref: ref || 'unknown',
    targetEnv,
    allowed: guard.allowed,
    requiresGate: guard.requiresGate,
    reason: guard.reason || (guard.allowed ? 'Command allowed for execution.' : 'Command blocked by safety policy.'),
    readiness: readinessResult ? readinessResult.overall : 'UNKNOWN',
  };
}

module.exports = { executeDeployWorkflow };
