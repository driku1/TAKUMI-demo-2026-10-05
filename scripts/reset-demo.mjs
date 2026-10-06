// Returns the skill demo to its starting point: no consultation, no Merged
// knowledge, empty workspace/. The open screen follows on its own.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetRuntime } from './runtime-store.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await resetRuntime(root);
console.log('初期化しました（登録知見・相談・workspace/ の出力を削除）。録画を開始し、Codexチャットで $takumi-launch を入力してください。');
