/**
 * src/workflows/releaseWorkflow.js
 * =================================
 * Independent Release Readiness Workflow
 * 
 * Flow:
 *   1. Accept ref and target environment
 *   2. Invoke check_release_readiness via MCPClient
 *   3. Invoke get_coverage_report for additional context
 *   4. Return readiness verdict and gate check breakdown
 */

'use strict';

/**
 * Executes release readiness workflow.
 * @param {object} params
 * @param {string} params.ref
 * @param {string} [params.targetEnv="staging"]
 * @param {import('../mcp/mcpClient').MCPClient} params.mcpClient
 * @returns {Promise<object>} Release readiness workflow result
 */
async function executeReleaseWorkflow({ ref, targetEnv = 'staging', mcpClient }) {
  if (!ref) throw new Error('releaseWorkflow: "ref" is required');
  if (!mcpClient) throw new Error('releaseWorkflow: "mcpClient" is required');

  const readiness = await mcpClient.callTool('check_release_readiness', {
    ref,
    target_env: targetEnv,
  });

  const coverage = await mcpClient.callTool('get_coverage_report', { ref });

  return {
    ref: readiness.ref || ref,
    targetEnv: readiness.target_env || targetEnv,
    overall: readiness.overall,
    isReady: readiness.overall === 'PASS',
    checks: readiness.checks || [],
    coverage: {
      totalCoveragePct: coverage.total_coverage_pct ?? null,
      fileCount: coverage.files?.length ?? 0,
    },
    summary: `Release check for "${ref}" to ${targetEnv}: ${readiness.overall}`,
  };
}

module.exports = { executeReleaseWorkflow };
