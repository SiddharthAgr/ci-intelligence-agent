/**
 * src/workflows/triageWorkflow.js
 * ================================
 * Independent CI Failure Triage Workflow
 * 
 * Flow:
 *   1. Receive CI failure / run ID
 *   2. Fetch run details via run_pipeline
 *   3. Generate / verify SHA-256 failure signature
 *   4. Query failure memory via recall_failures
 *   5. Produce structured triage recommendation
 *   6. Persist triage record via store_failure
 */

'use strict';

const crypto = require('crypto');

/**
 * Executes a full CI triage workflow for a given pipeline run reference.
 * @param {object} params
 * @param {string} params.runId - Pipeline run identifier (e.g. "run-42")
 * @param {import('../mcp/mcpClient').MCPClient} params.mcpClient
 * @param {string} [params.sessionId]
 * @returns {Promise<object>} Triage workflow summary result
 */
async function executeTriageWorkflow({ runId, mcpClient, sessionId = `session-${Date.now()}` }) {
  if (!runId) throw new Error('triageWorkflow: "runId" is required');
  if (!mcpClient) throw new Error('triageWorkflow: "mcpClient" is required');

  // Step 1 & 2: Fetch pipeline run
  const pipelineRes = await mcpClient.callTool('run_pipeline', { ref: runId });

  if (pipelineRes.status === 'passed') {
    return {
      runId,
      status: 'passed',
      failuresProcessed: 0,
      triage: [],
      summary: `Pipeline run "${runId}" passed. No triage needed.`,
    };
  }

  const failures = pipelineRes.failures || [];
  const triageResults = [];

  // Step 3–6: Triage each failure
  for (const failure of failures) {
    const testName = failure.test_name || failure.test || 'unknown_test';
    const errorType = failure.error_type || failure.error || 'Error';
    const failingFile = failure.failing_file || failure.file || 'unknown_file';
    const failureMsg = failure.failure_message || `${errorType}: in ${testName}`;

    // Compute signature: SHA-256(test_name + ":" + error_type + ":" + failing_file)
    let signature = failure.signature;
    if (!signature) {
      const sigRaw = `${testName}:${errorType}:${failingFile}`;
      signature = crypto.createHash('sha256').update(sigRaw).digest('hex');
    }

    // Step 4: Recall historical failures
    const recallRes = await mcpClient.callTool('recall_failures', { signature, limit: 5 });

    let action = 'fix';
    let confidence = 'medium';
    let confidenceScore = 0.70;
    let recommendation = '';

    if (recallRes.total_found > 0) {
      const topMatch = recallRes.matches[0];
      action = topMatch.action;
      confidence = topMatch.confidence || 'high';
      confidenceScore = topMatch.confidence_score || 0.90;
      recommendation = topMatch.recommendation || `Matched historical failure (${topMatch.failure_id}). Recommendation: ${action}.`;
    } else {
      action = 'escalate';
      confidence = 'low';
      confidenceScore = 0.40;
      recommendation = `Unseen failure pattern for ${testName} in ${failingFile}. Escalating for engineering investigation.`;
    }

    // Step 6: Store failure result
    const storeArgs = {
      signature,
      test_name: testName,
      error_type: errorType,
      failing_file: failingFile,
      action,
      confidence,
      confidence_score: confidenceScore,
      run_id: pipelineRes.run_id || runId,
      session_id: sessionId,
      failure_message: failureMsg,
      recommendation,
    };

    const storeRes = await mcpClient.callTool('store_failure', storeArgs);

    triageResults.push({
      testName,
      errorType,
      failingFile,
      signature,
      historicalMatches: recallRes.total_found,
      matches: recallRes.matches,
      recommendedAction: action,
      confidence,
      confidenceScore,
      recommendation,
      storedId: storeRes.failure_id,
      storedAt: storeRes.stored_at,
    });
  }

  return {
    runId: pipelineRes.run_id || runId,
    ref: pipelineRes.ref || runId,
    status: pipelineRes.status,
    failuresProcessed: triageResults.length,
    triage: triageResults,
    summary: `Triaged ${triageResults.length} failure(s) for run "${runId}".`,
  };
}

module.exports = { executeTriageWorkflow };
