import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { startRun } from '../lib/log.js';
import { getStore, handlers, toolDefs } from './tools.js';

// stdout adalah kanal MCP. Semua pesan untuk manusia harus lewat stderr.
for (const w of getStore().warnings) console.error(`[toko] ${w}`);

// Satu proses server = satu run.
const runId = process.env.TOKO_RUN_ID?.trim() || undefined;
const run = startRun('mcp', runId ?? 'server', runId);

const server = new McpServer({ name: 'toko', version: '1.0.0' });

for (const def of toolDefs) {
  server.registerTool(
    def.name,
    { description: def.description, inputSchema: def.inputSchema },
    async (input: unknown) => {
      let out;
      try {
        out = await handlers[def.name]!(input);
      } catch (err) {
        out = { content: `Error: ${(err as Error).message}`, isError: true };
      }
      run.log('tool_call', {
        name: def.name,
        input,
        isError: out.isError ?? false,
        content: out.content,
      });
      return { content: [{ type: 'text' as const, text: out.content }], isError: out.isError ?? false };
    },
  );
}

await server.connect(new StdioServerTransport());
