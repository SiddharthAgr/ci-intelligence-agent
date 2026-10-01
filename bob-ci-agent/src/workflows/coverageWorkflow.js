/**
 * src/workflows/coverageWorkflow.js
 * ==================================
 * Independent Coverage Workflow
 * 
 * Flow:
 *   1. Accept ref (e.g. "feat-auth")
 *   2. Invoke get_coverage_report via MCPClient
 *   3. Evaluate threshold (80%) and return structured coverage analysis
 */

'use strict';

/**
 * Executes coverage workflow for a given git reference.
 * @param {object} params
 * @param {string} params.ref
 * @param {import('../mcp/mcpClient').MCPClient} params.mcpClient
 * @returns {Promise<object>} Coverage workflow result
 */
async function executeCoverageWorkflow({ ref, mcpClient }) {
  if (!ref) throw new Error('coverageWorkflow: "ref" is required');
  if (!mcpClient) throw new Error('coverageWorkflow: "mcpClient" is required');

  const report = await mcpClient.callTool('get_coverage_report', { ref });

  if (report.error) {
    return {
      ref,
      passedThreshold: false,
      totalCoveragePct: null,
      error: report.error,
    };
  }

  const total = report.total_coverage_pct ?? 0;
  const passedThreshold = total >= 80;

  return {
    ref: report.ref || ref,
    totalCoveragePct: total,
    passedThreshold,
    requiredThreshold: 80,
    files: report.files || [],
    source: report.source || 'file',
    summary: `Ref "${ref}" coverage is ${total}% (${passedThreshold ? 'Meets' : 'Below'} 80% threshold).`,
  };
}

module.exports = { executeCoverageWorkflow };
