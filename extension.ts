import * as vscode from 'vscode'
import * as sp from './provider'
import * as searchyCommands from './commands'

export function activate(context) {
  let provider = new sp.SearchyProvider();

  const providerRegistrations = vscode.Disposable.from(
    vscode.workspace.registerTextDocumentContentProvider(sp.SearchyProvider.scheme, provider),
    vscode.languages.registerDocumentLinkProvider({scheme: sp.SearchyProvider.scheme}, provider)
  )

  function showSearchyPopup(options)
  {
    options = options || {};
    var value = options.path ? `${options.path}: ` : '';
    vscode.window.showInputBox({
      value: value,
      prompt: null,
      placeHolder: "Search term...",
      password: false,
      valueSelection: [value.length, value.length]
    }).then(cmd => {
      if (cmd && cmd.length) {
        var uri = vscode.Uri.parse(sp.SearchyProvider.scheme + `:${fileName(cmd)}.searchy?cmd=${cmd}`)
        return vscode.workspace.openTextDocument(uri).then(doc => {
          vscode.window.showTextDocument(doc, {preview: false, viewColumn: 1});
        });
      }
    })
  }

  const disposable = vscode.commands.registerCommand('searchy.search', function () {
    showSearchyPopup(null);
  });

  context.subscriptions.push(
    disposable,
    providerRegistrations,
    vscode.commands.registerCommand('searchy.openFile', searchyCommands.openFile)
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('searchy.searchInPath', (f) => {
      showSearchyPopup({
        path: vscode.workspace.asRelativePath(f.fsPath)
      });
  }));


}

export function deactivate() {}

function fileName(cmd) {
  return cmd.replace(/[^a-z0-9]/gi, '_').substring(0, 10)
}
