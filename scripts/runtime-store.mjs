// Demo runtime shared by the skill server (start-demo.mjs --skills), the
// Codex skills (run-skill.mjs) and reset-demo.mjs. Plain files under the app
// folder: runtime/ holds the current state and Merged knowledge, workspace/
// holds what each skill produced. Node standard library only.
import { appendFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const paths = (root) => ({
  runtime: join(root, 'runtime'),
  state: join(root, 'runtime', 'state.json'),
  knowledge: join(root, 'runtime', 'knowledge.json'),
  events: join(root, 'runtime', 'events.jsonl'),
  server: join(root, 'runtime', 'server.json'),
  workspace: join(root, 'workspace'),
});

export function initialState(previous) {
  return {
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    resetAt: new Date().toISOString(),
    screen: 'home',
    graphScenarioId: 'molding',
    consultation: null,
    consultationSeq: 0,
    lastSkill: null,
    completedSkills: [],
    knowledgeRevision: (previous?.knowledgeRevision ?? 0) + 1,
  };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Write to a temporary file first so a reader never sees half a file.
async function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

export async function readState(root) {
  const state = await readJson(paths(root).state, null);
  if (state) return state;
  await mkdir(paths(root).runtime, { recursive: true });
  const fresh = initialState();
  await writeJson(paths(root).state, fresh);
  return fresh;
}

/** Applies a change and bumps the revision the UI watches. */
export async function updateState(root, change) {
  const current = await readState(root);
  const next = { ...change(current), revision: current.revision + 1, updatedAt: new Date().toISOString() };
  await writeJson(paths(root).state, next);
  return next;
}

/** Merged (human-approved) knowledge only. */
export async function readKnowledge(root) {
  const items = await readJson(paths(root).knowledge, []);
  return Array.isArray(items) ? items : [];
}

const isKnowledge = (item) =>
  item &&
  typeof item.id === 'string' &&
  typeof item.title === 'string' &&
  typeof item.summary === 'string' &&
  Array.isArray(item.tags) &&
  typeof item.author === 'string' &&
  item.isNew === true &&
  typeof item.provenance?.review?.mergedAt === 'string';

/** Called when a person presses Merge in the UI. Never called by a skill. */
export async function recordMerge(root, item, consultationId) {
  if (!isKnowledge(item)) throw new Error('invalid knowledge');
  await mkdir(paths(root).runtime, { recursive: true });
  const items = await readKnowledge(root);
  if (!items.some((entry) => entry.id === item.id)) {
    await writeJson(paths(root).knowledge, [item, ...items]);
  }
  const state = await updateState(root, (current) => ({
    ...current,
    knowledgeRevision: current.knowledgeRevision + 1,
    consultation:
      current.consultation && current.consultation.id === consultationId
        ? { ...current.consultation, stage: 'merged', merged: item.id, step: 5 }
        : current.consultation,
  }));
  await logEvent(root, { type: 'knowledge.merged', id: item.id, consultationId, by: 'person' });
  return state;
}

export async function logEvent(root, event) {
  await mkdir(paths(root).runtime, { recursive: true });
  await appendFile(paths(root).events, `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`, 'utf8');
}

export async function resetRuntime(root) {
  const previous = await readJson(paths(root).state, null);
  await mkdir(paths(root).runtime, { recursive: true });
  await rm(paths(root).workspace, { recursive: true, force: true });
  await rm(paths(root).events, { force: true });
  await writeJson(paths(root).knowledge, []);
  const state = initialState(previous);
  await writeJson(paths(root).state, state);
  return state;
}

export async function readServer(root) {
  return readJson(paths(root).server, null);
}

export async function writeServer(root, info) {
  await mkdir(paths(root).runtime, { recursive: true });
  await writeJson(paths(root).server, info);
}
