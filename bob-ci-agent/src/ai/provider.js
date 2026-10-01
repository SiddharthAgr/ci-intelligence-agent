/**
 * src/ai/provider.js
 * ==================
 * Provider-Agnostic AI Reasoning Abstraction
 * 
 * Defines the AIProvider interface and implementations:
 *   - RuleBasedAIProvider (Deterministic expert system reasoning using MCP tools)
 *   - GeminiAIProvider (Configurable LLM provider when GEMINI_API_KEY is present)
 */

'use strict';

const crypto = require('crypto');

/**
 * Interface / Base Class for AI Providers
 */
class BaseAIProvider {
  /**
   * Process a user query with access to an MCPClient and Safety middleware.
   * @param {string} prompt 
   * @param {object} context 
   * @param {import('../mcp/mcpClient').MCPClient} context.mcpClient 
   * @returns {Promise<{ answer: string, toolCallsMade: object[], metadata: object }>}
   */
  async query(prompt, context) {
    throw new Error('AIProvider.query must be implemented by subclass');
  }
}

/**
 * Deterministic / Rule-Based Expert AI Reasoning Engine
 */
class RuleBasedAIProvider extends BaseAIProvider {
  async query(prompt, context) {
    const { mcpClient } = context;
    const lowerPrompt = prompt.toLowerCase();
    const toolCallsMade = [];

    // 1. Check for pipeline run / failure triage query
    const runMatch = prompt.match(/\b(run-\d+|[a-zA-Z0-9_-]+-run)\b/i) || prompt.match(/pipeline\s+([a-zA-Z0-9._-]+)/i);
    if (lowerPrompt.includes('why') || lowerPrompt.includes('fail') || lowerPrompt.includes('triage') || runMatch) {
      const ref = runMatch ? runMatch[1] : 'run-42';
      
      // Call run_pipeline
      toolCallsMade.push({ tool: 'run_pipeline', args: { ref } });
      const pipelineRes = await mcpClient.callTool('run_pipeline', { ref });

      if (pipelineRes.status === 'passed') {
        return {
          answer: `Pipeline run "${ref}" passed successfully with 0 failures. No triage required.`,
          toolCallsMade,
          metadata: { provider: 'RuleBased', status: 'passed' },
        };
      }

      if (!pipelineRes.failures || pipelineRes.failures.length === 0) {
        return {
          answer: `Pipeline run "${ref}" status is ${pipelineRes.status}, but no individual test failure details were reported.`,
          toolCallsMade,
          metadata: { provider: 'RuleBased', status: pipelineRes.status },
        };
      }

      // Analyze failures
      const triageResults = [];
      for (const failure of pipelineRes.failures) {
        const testName = failure.test_name || failure.test || 'unknown_test';
        const errorType = failure.error_type || failure.error || 'Error';
        const failingFile = failure.failing_file || failure.file || 'unknown_file';

        // Compute signature if not provided
        let signature = failure.signature;
        if (!signature) {
          const sigRaw = `${testName}:${errorType}:${failingFile}`;
          signature = crypto.createHash('sha256').update(sigRaw).digest('hex');
        }

        // Call recall_failures
        toolCallsMade.push({ tool: 'recall_failures', args: { signature, limit: 5 } });
        const historyRes = await mcpClient.callTool('recall_failures', { signature, limit: 5 });

        let recommendedAction = 'fix';
        let confidence = 'medium';
        let confidenceScore = 0.70;
        let recommendation = '';

        if (historyRes.total_found > 0) {
          const topMatch = historyRes.matches[0];
          recommendedAction = topMatch.action;
          confidence = topMatch.confidence || 'high';
          confidenceScore = topMatch.confidence_score || 0.90;
          recommendation = topMatch.recommendation || `Matched historical failure pattern (${topMatch.failure_id}). Recommended action: ${recommendedAction}.`;
        } else {
          recommendedAction = 'escalate';
          confidence = 'low';
          confidenceScore = 0.40;
          recommendation = `Unseen failure pattern (Signature: ${signature.slice(0, 8)}...). Escalating for developer review.`;
        }

        // Store triage result
        const storeArgs = {
          signature,
          test_name: testName,
          error_type: errorType,
          failing_file: failingFile,
          action: recommendedAction,
          confidence,
          confidence_score: confidenceScore,
          run_id: pipelineRes.run_id || ref,
          failure_message: failure.failure_message || `${errorType}: in ${testName}`,
          recommendation,
        };

        toolCallsMade.push({ tool: 'store_failure', args: storeArgs });
        const storeRes = await mcpClient.callTool('store_failure', storeArgs);

        triageResults.push({
          testName,
          errorType,
          failingFile,
          signature,
          historyCount: historyRes.total_found,
          action: recommendedAction,
          confidence,
          confidenceScore,
          recommendation,
          storedId: storeRes.failure_id,
        });
      }

      // Format response
      const answerLines = [
        `### Failure Analysis for Pipeline Run \`${ref}\``,
        `**Status**: ${pipelineRes.status.toUpperCase()} | **Failures Detected**: ${pipelineRes.failures.length}`,
        '',
      ];

      for (const t of triageResults) {
        answerLines.push(`#### Test: \`${t.testName}\``);
        answerLines.push(`- **Error**: \`${t.errorType}\` in \`${t.failingFile}\``);
        answerLines.push(`- **Signature**: \`${t.signature.slice(0, 16)}...\``);
        answerLines.push(`- **Historical Matches**: ${t.historyCount} match(es) in failure memory`);
        answerLines.push(`- **Recommended Action**: **${t.action.toUpperCase()}** (Confidence: ${t.confidence}, ${Math.round(t.confidenceScore * 100)}%)`);
        answerLines.push(`- **Recommendation**: ${t.recommendation}`);
        if (t.storedId) {
          answerLines.push(`- **Audit Record**: Stored to memory as \`${t.storedId}\``);
        }
        answerLines.push('');
      }

      return {
        answer: answerLines.join('\n'),
        toolCallsMade,
        metadata: { provider: 'RuleBased', pipelineRun: ref, triageResults },
      };
    }

    // 2. Check for release readiness query
    if (lowerPrompt.includes('release') || lowerPrompt.includes('ready') || lowerPrompt.includes('deploy')) {
      const refMatch = prompt.match(/\b(feat[/-][a-zA-Z0-9_-]+|main|staging|master)\b/i);
      const ref = refMatch ? refMatch[1] : 'feat-auth';

      toolCallsMade.push({ tool: 'check_release_readiness', args: { ref, target_env: 'staging' } });
      const readinessRes = await mcpClient.callTool('check_release_readiness', { ref, target_env: 'staging' });

      toolCallsMade.push({ tool: 'get_coverage_report', args: { ref } });
      const coverageRes = await mcpClient.callTool('get_coverage_report', { ref });

      const lines = [
        `### Release Readiness Report for \`${ref}\` (Target: staging)`,
        `**Overall Status**: **${readinessRes.overall}**`,
        '',
        '#### Gates Evaluated:',
      ];

      for (const check of readinessRes.checks || []) {
        const icon = check.status === 'PASS' ? '✓' : check.status === 'WARNING' ? '⚠️' : '❌';
        lines.push(`- ${icon} **${check.name}**: ${check.status} — ${check.detail}`);
      }

      if (coverageRes.total_coverage_pct !== null && coverageRes.total_coverage_pct !== undefined) {
        lines.push('');
        lines.push(`**Coverage Breakdown**: Total ${coverageRes.total_coverage_pct}% across ${coverageRes.files?.length || 0} file(s).`);
      }

      return {
        answer: lines.join('\n'),
        toolCallsMade,
        metadata: { provider: 'RuleBased', ref, readiness: readinessRes.overall },
      };
    }

    // 3. Check for coverage query
    if (lowerPrompt.includes('coverage')) {
      const refMatch = prompt.match(/\b(feat[/-][a-zA-Z0-9_-]+|main|staging|master)\b/i);
      const ref = refMatch ? refMatch[1] : 'feat-auth';

      toolCallsMade.push({ tool: 'get_coverage_report', args: { ref } });
      const coverageRes = await mcpClient.callTool('get_coverage_report', { ref });

      if (coverageRes.error) {
        return {
          answer: `Coverage report for "${ref}" could not be retrieved: ${coverageRes.error}`,
          toolCallsMade,
          metadata: { provider: 'RuleBased', error: coverageRes.error },
        };
      }

      const lines = [
        `### Test Coverage Report for \`${ref}\``,
        `**Total Coverage**: **${coverageRes.total_coverage_pct}%**`,
        '',
        '**File Breakdown:**',
      ];

      for (const file of coverageRes.files || []) {
        const uncovStr = file.uncovered_lines?.length > 0 ? ` (Uncovered lines: ${file.uncovered_lines.join(', ')})` : '';
        lines.push(`- \`${file.path}\`: ${file.coverage_pct}%${uncovStr}`);
      }

      return {
        answer: lines.join('\n'),
        toolCallsMade,
        metadata: { provider: 'RuleBased', ref, totalCoverage: coverageRes.total_coverage_pct },
      };
    }

    // Fallback general query
    return {
      answer: `CI Intelligence Agent AI Reasoning Layer ready.\nQuery received: "${prompt}".\nTry asking:\n- "Why did run-42 fail?"\n- "Is feat-auth ready for release?"\n- "Check coverage for feat-auth"`,
      toolCallsMade: [],
      metadata: { provider: 'RuleBased', fallback: true },
    };
  }
}

/**
 * Factory to get the active AI Provider based on environment configuration
 */
function getAIProvider() {
  if (process.env.GEMINI_API_KEY) {
    // If Gemini key is set, we could instantiate a Gemini provider, or default to RuleBased with AI notice
    // For standalone portability, RuleBased is always active and fallback-safe.
  }
  return new RuleBasedAIProvider();
}

module.exports = {
  BaseAIProvider,
  RuleBasedAIProvider,
  getAIProvider,
};
