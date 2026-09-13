import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { executeServer } from './wsServer';
import { getConnectScript } from './connectScript';
import { findAutoExecFolders, DEFAULT_AUTO_EXEC_NAMES } from './autoExec';

const CONNECT_FILE_NAME = 'VSCE-Execute.luau';
const LUAU_EXTENSIONS = new Set(['.lua', '.luau']);

let statusBar: vscode.StatusBarItem;
let connected = false;
let executorName: string | undefined;
let seenFirstStatus = false;

const cfg = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('vscExecute');

const outputOn = (): boolean => cfg().get<boolean>('showOutput', false);

function notify<T>(code: () => Thenable<T> | undefined): Thenable<T> | undefined {
  if (!cfg().get<boolean>('showNotifications', true)) return undefined;
  return code();
}

export function activate(context: vscode.ExtensionContext): void {
  executeServer.init(context.globalStoragePath);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5);
  statusBar.command = 'vscExecute.click';

  executeServer.onError = (err) => {
    notify(() => vscode.window.showErrorMessage(`VSC Execute: WebSocket server error: ${err.message}`));
  };

  executeServer.onStatusChange = (status) => {
    const wasConnected = connected;
    connected = status.connected;
    executorName = status.executorName;

    if (!seenFirstStatus) {
      seenFirstStatus = true;
    } else if (connected && !wasConnected) {
      const who = executorName ? ` (${executorName})` : '';
      notify(() => vscode.window.showInformationMessage(`VSC Execute: Executor connected${who}.`));
    } else if (!connected && wasConnected) {
      notify(() => vscode.window.showWarningMessage('VSC Execute: Executor disconnected.'));
    }

    if (status.connected && status.executorName) {
      executeServer.sendControl('output', outputOn() ? 'true' : 'false');
    }

    updateStatusBar();
  };

  const startServer = (): void => {
    executeServer.start(cfg().get<number>('port', 29999));
  };

  const executeActiveFile = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const code = editor.document.getText();
    if (code.trim().length === 0) {
      notify(() => vscode.window.showWarningMessage('VSC Execute: The active file is empty.'));
      return;
    }

    if (!executeServer.send(code)) {
      await showSetupMenu();
      return;
    }

    const base = path.basename(editor.document.fileName);
    notify(() => vscode.window.showInformationMessage(`VSC Execute: Sent "${base}" to executor.`));
  };

  type SetupAction = 'auto-exec' | 'uninstall-auto-exec' | 'copy' | 'toggle-output' | 'toggle-notifications';

  const showSetupMenu = async (): Promise<void> => {
    const outputOn = cfg().get<boolean>('showOutput', false);
    const notifOn = cfg().get<boolean>('showNotifications', true);

    const items: Array<(vscode.QuickPickItem & { action: SetupAction })> = [
      {
        action: 'auto-exec',
        label: '$(plug) Auto-Execute',
        description: 'Scan LocalAppData for auto-exec folders and install the connect script',
      },
      {
        action: 'uninstall-auto-exec',
        label: '$(trash) Uninstall Auto-Execute',
        description: 'Remove the installed connect script (VSCE-Execute.luau) from every auto-exec folder',
      },
      {
        action: 'copy',
        label: '$(copy) Copy Connect Script',
        description: 'Copy the connect script to the clipboard for manual setup',
      },
      {
        action: 'toggle-output',
        label: outputOn ? '$(check) Output: On' : '$(mute) Output: Off',
        description: outputOn
          ? 'Connect script logs its own status/errors ([VSC Execute] ...). Your scripts\' prints/warns still show.'
          : 'Connect script stays silent. Your scripts\' prints/warns still show.',
      },
      {
        action: 'toggle-notifications',
        label: notifOn ? '$(check) Notifications: On' : '$(mute) Notifications: Off',
        description: notifOn
          ? 'Show VSCode notifications (bottom-right toasts) for connect/disconnect and sends.'
          : 'Hide VSCode notifications (bottom-right toasts).',
      },
    ];

    const choice = await vscode.window.showQuickPick(items, {
      placeHolder: 'VSC Execute: No executor connected - how do you want to set up the connection?',
    });
    if (!choice) return;

    switch (choice.action) {
      case 'toggle-output':
        await cfg().update('showOutput', !outputOn, vscode.ConfigurationTarget.Global);
        await showSetupMenu();
        break;
      case 'toggle-notifications':
        await cfg().update('showNotifications', !notifOn, vscode.ConfigurationTarget.Global);
        await showSetupMenu();
        break;
      case 'auto-exec':
        await installAutoExec();
        break;
      case 'uninstall-auto-exec':
        await uninstallAutoExec();
        break;
      case 'copy':
        await copyConnectScript();
        break;
    }
  };

  const installAutoExec = async (): Promise<void> => {
    const names = cfg().get<string[]>('autoExecFolderNames', DEFAULT_AUTO_EXEC_NAMES);
    const port = cfg().get<number>('port', 29999);
    const output = cfg().get<boolean>('showOutput', false);

    const folders = findAutoExecFolders(names);
    if (folders.length === 0) {
      const action = await notify(() =>
        vscode.window.showWarningMessage(
          'VSC Execute: No auto-exec folders found in LocalAppData.',
          'Copy Connect Script',
        ),
      );
      if (action === 'Copy Connect Script') await copyConnectScript();
      return;
    }

    const script = getConnectScript(port, output);
    let installed = 0;
    for (const folder of folders) {
      try {
        fs.writeFileSync(path.join(folder, CONNECT_FILE_NAME), script, 'utf8');
        installed += 1;
      } catch {
        /* skip unwritable folders */
      }
    }

    if (installed === 0) {
      const action = await notify(() =>
        vscode.window.showErrorMessage(
          'VSC Execute: Could not write to any of the found folders.',
          'Copy Connect Script',
        ),
      );
      if (action === 'Copy Connect Script') await copyConnectScript();
      return;
    }

    const skipped = folders.length - installed;
    const where = installed === 1 ? '1 folder' : `${installed} folders`;
    const msg =
      `VSC Execute: Connect script installed into ${where}.` +
      (skipped > 0 ? ` Skipped ${skipped} folder(s).` : '') +
      ' Join a Roblox game and the executor will connect automatically.';
    const action = await notify(() => vscode.window.showInformationMessage(msg, 'Copy Connect Script'));
    if (action === 'Copy Connect Script') await copyConnectScript();
  };

  const uninstallAutoExec = async (): Promise<void> => {
    const names = cfg().get<string[]>('autoExecFolderNames', DEFAULT_AUTO_EXEC_NAMES);

    const folders = findAutoExecFolders(names).filter((folder) =>
      fs.existsSync(path.join(folder, CONNECT_FILE_NAME)),
    );
    if (folders.length === 0) {
      notify(() => vscode.window.showInformationMessage('VSC Execute: No installed connect script found.'));
      return;
    }

    let removed = 0;
    for (const folder of folders) {
      try {
        fs.unlinkSync(path.join(folder, CONNECT_FILE_NAME));
        removed += 1;
      } catch {
        /* skip unwritable folders */
      }
    }

    if (removed === 0) {
      notify(() => vscode.window.showErrorMessage('VSC Execute: Could not remove the connect script.'));
      return;
    }

    const where = removed === 1 ? '1 folder' : `${removed} folders`;
    notify(() =>
      vscode.window.showInformationMessage(
        `VSC Execute: Connect script removed from ${where}. It stops running the next time the game loads.`,
      ),
    );
  };

  const copyConnectScript = async (): Promise<void> => {
    const port = cfg().get<number>('port', 29999);
    const output = cfg().get<boolean>('showOutput', false);
    await vscode.env.clipboard.writeText(getConnectScript(port, output));
    notify(() => vscode.window.showInformationMessage('VSC Execute: Connect script copied to clipboard.'));
  };

  const isLuauFile = (doc: vscode.TextDocument): boolean => {
    const ext = path.extname(doc.fileName).toLowerCase();
    return LUAU_EXTENSIONS.has(ext) || doc.languageId === 'luau' || doc.languageId === 'lua';
  };

  const updateStatusBar = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isLuauFile(editor.document)) {
      statusBar.hide();
      return;
    }

    statusBar.show();
    const base = path.basename(editor.document.fileName);

    if (connected) {
      statusBar.text = `$(zap) Execute ${base}`;
      const who = executorName
        ? `Connected to ${executorName}`
        : `Connected on ws://127.0.0.1:${executeServer.port}`;
      statusBar.tooltip = `${who}\nClick to send "${base}" to the executor.`;
    } else {
      statusBar.text = '$(circle-slash) Not Connected';
      statusBar.tooltip = 'Click to set up a WebSocket connection to your executor.';
    }
  };

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand('vscExecute.click', async () => {
      if (connected) {
        await executeActiveFile();
      } else {
        await showSetupMenu();
      }
    }),
    vscode.commands.registerCommand('vscExecute.execute', executeActiveFile),
    vscode.commands.registerCommand('vscExecute.setup', showSetupMenu),
    vscode.window.onDidChangeActiveTextEditor(() => updateStatusBar()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('vscExecute.port')) startServer();
      if (event.affectsConfiguration('vscExecute.showOutput')) {
        executeServer.sendControl('output', outputOn() ? 'true' : 'false');
      }
      updateStatusBar();
    }),
  );

  startServer();
  updateStatusBar();
}

export function deactivate(): void {
  executeServer.dispose();
}