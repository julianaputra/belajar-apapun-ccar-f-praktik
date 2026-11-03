import type Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { RunLogger } from './log.js';
import type { ToolOutput } from '../mcp/tools.js';

export type Toko = {
  tools: Anthropic.Tool[];
  call(name: string, input: unknown): Promise<ToolOutput>;
  close(): Promise<void>;
};

/**
 * Jalankan MCP server toko sebagai proses anak (stdio) dan ubah tool-nya
 * menjadi format Messages API. Pencatatan panggilan dilakukan oleh server
 * (logs/mcp.jsonl), jadi jembatan ini tidak mencatat ulang.
 */
export async function connectToko(_run: RunLogger): Promise<Toko> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', 'src/mcp/server.ts'],
    cwd: process.cwd(),
    env,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'toko-bridge', version: '1.0.0' });
  await client.connect(transport);

  const listed = await client.listTools();
  const tools: Anthropic.Tool[] = listed.tools.map((t) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
  }));

  return {
    tools,
    async call(name, input) {
      const result = await client.callTool({ name, arguments: (input ?? {}) as Record<string, unknown> });
      const blocks = (result.content ?? []) as { type: string; text?: string }[];
      const content = blocks
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('\n');
      return { content, isError: Boolean(result.isError) };
    },
    close: () => client.close(),
  };
}
