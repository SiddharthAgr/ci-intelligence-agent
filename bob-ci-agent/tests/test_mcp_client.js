/**
 * tests/test_mcp_client.js
 * =========================
 * Tests the standalone MCPClient against the Node.js MCP server.
 */

'use strict';

const { MCPClient } = require('../src/mcp/mcpClient');

async function testMCPClient() {
  console.log('[test_mcp_client] Starting MCP Client test...');
  const client = new MCPClient();

  try {
    await client.connect();
    console.log('✓ Connected to MCP server');

    const tools = await client.listTools();
    console.log(`✓ Tools discovered: ${tools.length}`);
    const toolNames = tools.map(t => t.name);
    console.log('  Available tools:', toolNames.join(', '));

    if (!toolNames.includes('run_pipeline') || !toolNames.includes('recall_failures')) {
      throw new Error('Missing expected tools in listTools');
    }

    // Call run_pipeline
    const pipelineRes = await client.callTool('run_pipeline', { ref: 'run-42' });
    console.log('✓ run_pipeline tool returned:', pipelineRes.status, `(${pipelineRes.failures?.length || 0} failures)`);

    if (pipelineRes.status !== 'failed') {
      throw new Error(`Expected run-42 status failed, got ${pipelineRes.status}`);
    }

    // Call recall_failures
    const recallRes = await client.callTool('recall_failures', {
      signature: 'e05df3df6765b575ef14be0d76c581b5d7e29f641cd5520c270680c0fb63ecde',
      limit: 5,
    });
    console.log('✓ recall_failures tool returned matches:', recallRes.total_found);

    await client.close();
    console.log('✓ Closed MCP connection cleanly');
    console.log('\n[test_mcp_client] ALL MCP CLIENT TESTS PASSED');
  } catch (err) {
    console.error('✗ MCP Client test failed:', err);
    await client.close();
    process.exit(1);
  }
}

testMCPClient();
