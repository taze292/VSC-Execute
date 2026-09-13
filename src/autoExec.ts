import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const DEFAULT_AUTO_EXEC_NAMES = [
  'Auto-Execute',
  'Auto-Exec',
  'Auto Execute',
  'Auto Exec',
  'AutoExec',
  'Auto-Execution',
  'Autoexecution',
  'Autoexecute',
  'AutoExecute',
  'Auto_Execute',
  'Autoexec Folder',
  'Auto Exec Folder',
  'Auto Execute Folder',
  'Auto Execution',
  'Auto Load',
  'Autoload',
  'Auto Run',
  'Autorun',
  'Auto Start',
  'Autostart',
  'Exec',
  'Executions',
  'Executor',
  'Executor Scripts',
];

const SKIPPED_DIRS = new Set([
  'Microsoft',
  'Google',
  'Temp',
  'Package Cache',
  'CrashDumps',
  'D3DSCache',
  'npm-cache',
  'Yarn',
  'yarn',
  'pip',
  'Programs',
]);

const MAX_DEPTH = 4;
const MAX_SCAN = 4000;

export function findAutoExecFolders(folderNames: string[]): string[] {
  const root = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  if (!root || !fs.existsSync(root)) {
    return [];
  }

  const wanted = new Set(folderNames.map((name) => name.toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return [];

  const matches: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  let scanned = 0;

  while (queue.length > 0 && scanned < MAX_SCAN) {
    const { dir, depth } = queue.shift()!;
    scanned += 1;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (wanted.has(entry.name.toLowerCase())) {
        matches.push(full);
        continue;
      }
      if (depth + 1 < MAX_DEPTH && !SKIPPED_DIRS.has(entry.name)) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }

  return matches;
}