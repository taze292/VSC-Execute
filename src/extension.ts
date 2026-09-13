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

export function activate(context: vscode.ExtensionContext): void {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5);
  statusBar.command = 'vscExecute.click';

  executeServer.onError = (err) => {
    void vscode.window.showErrorMessage(`VSC Execute: WebSocket server error: ${err.message}`);
  };

  executeServer.onStatusChange = (status) => {
    const wasConnected = connected;
    connected = status.connected;
    executorName = status.executorName;

    if (!seenFirstStatus) {
      seenFirstStatus = true;
    } else if (connected && !wasConnected) {
      const who = executorName ? ` (${executorName})` : '';
      void vscode.window.showInformationMessage(`VSC Execute: Executor connected${who}.`);
    } else if (!connected && wasConnected) {
      void vscode.window.showWarningMessage('VSC Execute: Executor disconnected.');
    }

    updateStatusBar();
  };

  const startServer = (): void => {
    const port = vscode.workspace.getConfiguration('vscExecute').get<number>('port', 29999);
    executeServer.start(port);
  };

  const executeActiveFile = async (): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const code = editor.document.getText();
    if (code.trim().length === 0) {
      void vscode.window.showWarningMessage('VSC Execute: The active file is empty.');
      return;
    }

    if (!executeServer.send(code)) {
      await showSetupMenu();
      return;
    }

    const base = path.basename(editor.document.fileName);
    void vscode.window.showInformationMessage(`VSC Execute: Sent "${base}" to executor.`);
  };

  const showSetupMenu = async (): Promise<void> => {
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: '$(plug) Auto-Execute',
          description: 'Scan LocalAppData for auto-exec folders and install the connect script',
        },
        {
          label: '$(copy) Copy Connect Script',
          description: 'Copy the connect script to the clipboard for manual setup',
        },
      ],
      { placeHolder: 'VSC Execute: No executor connected - how do you want to set up the connection?' },
    );
    if (!choice) return;

    if (choice.label.includes('Auto-Execute')) {
      await installAutoExec();
    } else {
      await copyConnectScript();
    }
  };

  const installAutoExec = async (): Promise<void> => {
    const cfg = vscode.workspace.getConfiguration('vscExecute');
    const names = cfg.get<string[]>('autoExecFolderNames', DEFAULT_AUTO_EXEC_NAMES);
    const port = cfg.get<number>('port', 29999);

    const folders = findAutoExecFolders(names);
    if (folders.length === 0) {
      const action = await vscode.window.showWarningMessage(
        'VSC Execute: No auto-exec folders found in LocalAppData.',
        'Copy Connect Script',
      );
      if (action === 'Copy Connect Script') await copyConnectScript();
      return;
    }

    const script = getConnectScript(port);
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
      const action = await vscode.window.showErrorMessage(
        'VSC Execute: Could not write to any of the found folders.',
        'Copy Connect Script',
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
    const action = await vscode.window.showInformationMessage(msg, 'Copy Connect Script');
    if (action === 'Copy Connect Script') await copyConnectScript();
  };

  const copyConnectScript = async (): Promise<void> => {
    const port = vscode.workspace.getConfiguration('vscExecute').get<number>('port', 29999);
    await vscode.env.clipboard.writeText(getConnectScript(port));
    void vscode.window.showInformationMessage('VSC Execute: Connect script copied to clipboard.');
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
      updateStatusBar();
    }),
  );

  startServer();
  updateStatusBar();
}

export function deactivate(): void {
  executeServer.dispose();
}