import * as vscode from 'vscode'
const rootPath = vscode.workspace.rootPath

export function openFile(params) {
  let filePath = `${rootPath}/${params.fileName}`
  vscode.workspace.openTextDocument(filePath).then(doc => {
    vscode.window.showTextDocument(doc, 1).then(() => {
      if (params.line) {
        let revealType = vscode.TextEditorRevealType.InCenter
        let editor = vscode.window.activeTextEditor
        let range = editor.document.lineAt(params.line - 1).range
        editor.selection = new vscode.Selection(range.start, range.end)
        editor.revealRange(range, revealType)
      }
    })
  })
}
