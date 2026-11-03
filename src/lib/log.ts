import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type Project = 'p1' | 'p3' | 'p4' | 'mcp';

export type LogEvent = {
  ts: string;
  runId: string;
  label: string;
  event: string;
  [key: string]: unknown;
};

export type Run = { runId: string; label: string; events: LogEvent[] };

export type RunLogger = {
  runId: string;
  label: string;
  log(event: string, data?: Record<string, unknown>): void;
};

function logFile(project: Project): string {
  return join(process.env.LOG_DIR || 'logs', `${project}.jsonl`);
}

export function startRun(project: Project, label: string, runId: string = randomUUID()): RunLogger {
  return {
    runId,
    label,
    log(event, data = {}) {
      const file = logFile(project);
      mkdirSync(join(file, '..'), { recursive: true });
      const line: LogEvent = { ts: new Date().toISOString(), runId, label, event, ...data };
      appendFileSync(file, JSON.stringify(line) + '\n');
    },
  };
}

/** Semua run (opsional: satu label), urut dari yang paling lama. */
export function readRuns(project: Project, label?: string): Run[] {
  const file = logFile(project);
  if (!existsSync(file)) return [];
  const runs = new Map<string, Run>();
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    let ev: LogEvent;
    try {
      ev = JSON.parse(raw) as LogEvent;
    } catch {
      continue;
    }
    if (label !== undefined && ev.label !== label) continue;
    let run = runs.get(ev.runId);
    if (!run) {
      run = { runId: ev.runId, label: ev.label, events: [] };
      runs.set(ev.runId, run);
    }
    run.events.push(ev);
  }
  return [...runs.values()];
}

export function latestRun(project: Project, label: string): Run | undefined {
  return readRuns(project, label).at(-1);
}
