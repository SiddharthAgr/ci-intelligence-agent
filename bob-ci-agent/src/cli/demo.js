/**
 * src/cli/demo.js
 * ===============
 * Deterministic Demo Workflow for CI Intelligence Agent
 * 
 * Demonstrates the complete end-to-end intelligence pipeline using seeded fixtures:
 *   run-42 fixture → failure detection → signature generation → historical recall →
 *   triage recommendation → coverage analysis → release readiness gate → deployment safety guard.
 */

'use strict';

const { MCPClient } = require('../mcp/mcpClient');
const { executeTriageWorkflow } = require('../workflows/triageWorkflow');
const { executeCoverageWorkflow } = require('../workflows/coverageWorkflow');
const { executeReleaseWorkflow } = require('../workflows/releaseWorkflow');
const { executeDeployWorkflow } = require('../workflows/deployWorkflow');
const { logSessionEnd } = require('../memory/sessionManager');

async function runDemo() {
  console.log('='.repeat(72));
  console.log('  🤖 CI Intelligence Agent — Deterministic End-to-End Demo');
  console.log('  Mode: Seeded Fixture Mode (Reproducible Offline Demonstration)');
  console.log('='.repeat(72));
  console.log('\n[DEMO NOTE] All data in this demo is loaded from local seeded fixtures.');
  console.log('[DEMO NOTE] Fixtures: demo/fixtures/run-42.json, reports/coverage-feat-auth.json, memory/failures.db\n');

  const mcpClient = new MCPClient();
  const sessionId = `demo-session-${Date.now()}`;
  const startTime = new Date().toISOString();

  try {
    // 1. Start MCP Client connection
    console.log('STEP 1: Initializing Standalone MCP Client & Server...');
    await mcpClient.connect();
    const tools = await mcpClient.listTools();
    console.log(`✓ Connected to MCP Server. Discovered ${tools.length} MCP tools:`);
    tools.forEach(t => console.log(`  - ${t.name}: ${t.description.slice(0, 60)}...`));
    console.log();

    // 2. Fetch Pipeline Run (run-42)
    console.log('STEP 2: Fetching CI Pipeline Run "run-42"...');
    const pipelineRes = await mcpClient.callTool('run_pipeline', { ref: 'run-42' });
    console.log(`✓ CI Pipeline Status: [${pipelineRes.status.toUpperCase()}]`);
    console.log(`✓ Failures Detected : ${pipelineRes.failures.length}`);
    const f0 = pipelineRes.failures[0];
    console.log(`  Failing Test : ${f0.test_name}`);
    console.log(`  Error Type   : ${f0.error_type}`);
    console.log(`  File Path    : ${f0.failing_file}`);
    console.log(`  Message      : ${f0.failure_message}`);
    console.log();

    // 3. Triage & Failure Recall
    console.log('STEP 3: Running Automated Failure Triage & Memory Recall...');
    const triageRes = await executeTriageWorkflow({ runId: 'run-42', mcpClient, sessionId });
    const t0 = triageRes.triage[0];
    console.log(`✓ Computed SHA-256 Signature: ${t0.signature}`);
    console.log(`✓ Searched Failure Memory   : Found ${t0.historicalMatches} historical match(es)`);
    console.log(`✓ Recommended Action       : [${t0.recommendedAction.toUpperCase()}] (Confidence: ${t0.confidence}, ${Math.round(t0.confidenceScore * 100)}%)`);
    console.log(`✓ Recommendation Detail    : ${t0.recommendation}`);
    console.log(`✓ Audit Record Persisted   : Stored as ${t0.storedId}`);
    console.log();

    // 4. Coverage Analysis
    console.log('STEP 4: Evaluating Code Coverage for "feat-auth"...');
    const coverageRes = await executeCoverageWorkflow({ ref: 'feat-auth', mcpClient });
    console.log(`✓ Total Code Coverage : ${coverageRes.totalCoveragePct}% (Required: ${coverageRes.requiredThreshold}%)`);
    console.log(`✓ Threshold Gate      : ${coverageRes.passedThreshold ? 'PASS' : 'BLOCKER (Below 80% threshold)'}`);
    console.log('  File Breakdown:');
    coverageRes.files.forEach(file => {
      console.log(`    - ${file.path}: ${file.coverage_pct}% ${file.uncovered_lines.length ? `(Uncovered: lines ${file.uncovered_lines.join(', ')})` : ''}`);
    });
    console.log();

    // 5. Release Readiness Gate
    console.log('STEP 5: Evaluating Release Readiness Gates for "feat-auth" (Target: staging)...');
    const releaseRes = await executeReleaseWorkflow({ ref: 'feat-auth', targetEnv: 'staging', mcpClient });
    console.log(`✓ Overall Readiness Verdict: [${releaseRes.overall}]`);
    releaseRes.checks.forEach(c => {
      const icon = c.status === 'PASS' ? '✓' : c.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`  ${icon} ${c.name}: ${c.status} — ${c.detail}`);
    });
    console.log();

    // 6. Deployment Safety Check
    console.log('STEP 6: Testing Standalone Deployment Safety Guard...');
    const commandToTest = 'kubectl apply -f deployment.yaml';
    console.log(`  Attempting command: "${commandToTest}"`);
    const deployRes = await executeDeployWorkflow({
      command: commandToTest,
      ref: 'feat-auth',
      targetEnv: 'staging',
      mcpClient,
    });

    if (deployRes.allowed) {
      console.log(`✓ Command Allowed: ${deployRes.reason}`);
    } else {
      console.log(`❌ Command BLOCKED: ${deployRes.reason}`);
    }
    console.log();

    // 7. Audit Logging
    console.log('STEP 7: Logging Session Audit Completion...');
    const auditEntry = await logSessionEnd({
      sessionId,
      summary: 'Deterministic Demo Execution Complete',
      outcome: 'recommendation_stored',
      failuresProcessed: triageRes.failuresProcessed,
      startedAt: startTime,
    });
    console.log(`✓ Audit Log Entry Recorded: Session ID ${auditEntry.session_id} (${auditEntry.outcome})\n`);

    console.log('='.repeat(72));
    console.log('  🎉 DEMO COMPLETE — All 7 Intelligence Stages Verified Successfully!');
    console.log('='.repeat(72));

    await mcpClient.close();
  } catch (err) {
    console.error('\n❌ Demo encountered an error:', err.message);
    await mcpClient.close();
    process.exit(1);
  }
}

module.exports = { runDemo };
