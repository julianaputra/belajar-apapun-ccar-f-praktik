import Anthropic from '@anthropic-ai/sdk';
import { loadEnv, UserError } from './env.js';
import type { RunLogger } from './log.js';

export function anthropic(): Anthropic {
  return new Anthropic({ apiKey: loadEnv().apiKey });
}

function hasFewShot(params: Anthropic.MessageCreateParamsNonStreaming): boolean {
  const system =
    typeof params.system === 'string'
      ? params.system
      : (params.system ?? []).map((b) => b.text).join('\n');
  const messages = params.messages
    .map((m) =>
      typeof m.content === 'string'
        ? m.content
        : m.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n'),
    )
    .join('\n');
  return `${system}\n${messages}`.includes('<contoh>');
}

/** Panggil Messages API dan catat request/response ke log. */
export async function createMessage(
  run: RunLogger,
  params: Anthropic.MessageCreateParamsNonStreaming,
  client: Anthropic = anthropic(),
): Promise<Anthropic.Message> {
  run.log('request', {
    model: params.model,
    tool_choice: params.tool_choice,
    tools: (params.tools ?? []).map((t) => ('name' in t ? t.name : String(t.type))),
    few_shot: hasFewShot(params),
  });
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(params);
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError && /tool_choice/.test(err.message)) {
      throw new UserError(
        `Model ${params.model} menolak tool_choice yang dipaksa (error 400).\n` +
          'tool_choice {type: "tool"} hanya jalan di claude-haiku-5-5.\n' +
          'Ubah MODEL=claude-haiku-5-5 di .env, atau pakai tool_choice "auto".',
      );
    }
    throw err;
  }
  run.log('response', {
    stop_reason: message.stop_reason,
    tool_uses: message.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ name: b.name, input: b.input })),
    usage: message.usage ?? null,
  });
  return message;
}
