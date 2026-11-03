import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

/** Bagian pesan SDK yang dicatat: isi pesan untuk assistant/user, ringkasan untuk result dan init. */
export function isiPesan(m: SDKMessage): unknown {
  const r = m as unknown as Record<string, unknown>;
  if (m.type === 'assistant' || m.type === 'user') return (r.message as { content?: unknown } | undefined)?.content;
  if (m.type === 'result') {
    const { result, errors, is_error, num_turns, total_cost_usd, usage, permission_denials } = r;
    return { result, errors, is_error, num_turns, total_cost_usd, usage, permission_denials };
  }
  if (m.type === 'system' && r.subtype === 'init') return { model: r.model, tools: r.tools, mcp_servers: r.mcp_servers };
  return undefined;
}

export const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Cetak pesan SDK untuk manusia: MCP server yang gagal tersambung, teks, tool_use, dan tool_result.
 * Pesan dari dalam subagent (parent_tool_use_id terisi) diberi label tipe subagent-nya.
 * Pesan result tidak dicetak di sini: setiap pipa mencetak ringkasannya sendiri.
 */
export function cetakPesan(m: SDKMessage, print: (s: string) => void, opts: { utama: string; batas: number }): void {
  const r = m as unknown as Record<string, unknown>;
  const isi = isiPesan(m);
  if (m.type === 'system' && Array.isArray((isi as { mcp_servers?: unknown })?.mcp_servers)) {
    for (const s of (isi as { mcp_servers: { name: string; status: string }[] }).mcp_servers) {
      if (s.status !== 'connected') print(`[pipa] MCP server ${s.name}: ${s.status}`);
    }
  }
  if ((m.type === 'assistant' || m.type === 'user') && Array.isArray(isi)) {
    const siapa = r.parent_tool_use_id ? `  [${String(r.subagent_type ?? 'subagent')}]` : opts.utama;
    for (const b of isi as Record<string, unknown>[]) {
      if (b.type === 'text') print(`${siapa}: ${potong(String(b.text), opts.batas)}`);
      if (b.type === 'tool_use') print(`${siapa} → ${String(b.name)} ${potong(JSON.stringify(b.input), opts.batas)}`);
      if (b.type === 'tool_result') {
        const c = b.content;
        const t = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x: { text?: string }) => x.text ?? '').join(' ') : '';
        print(`${siapa} ← ${b.is_error ? '(error) ' : ''}${potong(t, opts.batas)}`);
      }
    }
  }
}
