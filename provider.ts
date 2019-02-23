import * as vscode from 'vscode'
import * as querystring from 'querystring'
import * as path from 'path'
import * as ripgrep from 'vscode-ripgrep'
import * as child_process from 'child_process'

const rootPath = vscode.workspace.rootPath

const execOpts = {
  cwd: rootPath,
  maxBuffer: 1024 * 1000
}

export class SearchyProvider {
  links:Array<Array<vscode.DocumentLink>>;
  _subscriptions: vscode.Disposable;

  constructor() {
    this.links = []
    this._subscriptions = vscode.workspace.onDidCloseTextDocument(doc => {
      this.links[doc.uri.toString()] = []
    });
  };

  dispose() {
    this._subscriptions.dispose()
  }

  static get scheme() {
    return 'searchy'
  }

  onDidChange() { return null; }

  provideTextDocumentContent(uri) {
    let uriString = uri.toString()
    this.links[uriString] = [];
    const params = querystring.parse(uri.query)
    const cmd = params.cmd

    let searchQuery = parseSearchQuery(cmd);
    let searchResults = null
    try {
      searchResults = runCommandSync(searchQuery)
    } catch (err) {
      return `${err}`
    }

    if (searchResults == null || !searchResults.length) {
      return 'There was an error during your search!'
    }

    let resultsArray = searchResults.toString().split('\n')
    resultsArray = resultsArray.filter((item) => {
      return item != null && item.length > 0
    })
    let resultsByFile = {}
    let lastFormattedLine;

    var addFormattedLine = function(formattedLine) {
      if (! resultsByFile.hasOwnProperty(formattedLine.file)) {
         resultsByFile[formattedLine.file] = [];
      }
      
      resultsByFile[formattedLine.file].push(formattedLine);
    }

    resultsArray.forEach((searchResult) => {
      let splitLine = searchResult.match(/(.*?):(\d+):(\d+):(.*)/);
      let formattedLine;
      if (splitLine) {
        formattedLine = formatLine(splitLine)
      } else if (searchResult == '--') {
        if (lastFormattedLine) {
          addFormattedLine({
            file: lastFormattedLine.file,
            seperator: true
          });
        }
      } else {
        let contextLine = searchResult.match(/(.*?)-(\d+)-(.*)/);
        
        if (contextLine) {
          formattedLine = formatContextLine(contextLine)
        }
      }

      if (formattedLine === undefined) {
        return;
      }

      addFormattedLine(formattedLine);

      lastFormattedLine = formattedLine;
      
    });

    var removeTrailingSeperators = function() {
      for (var file in resultsByFile) {
        let lines = resultsByFile[file];
        if (lines[lines.length - 1].seperator) {
          lines.splice(lines.length - 1, 1);
          resultsByFile[file] = lines;
        }
      }
    };

    removeTrailingSeperators();

    let sortedFiles = Object.keys(resultsByFile).sort()
    let lineNumber = 1

    let lines = sortedFiles.map((fileName) => {
      lineNumber += 1
      let resultsForFile = resultsByFile[fileName].map((searchResult, index) => {
        lineNumber += 1
        if (searchResult.seperator) {
          return '  ..';
        } else {
          this.createDocumentLink(searchResult, lineNumber, searchQuery, uriString)
          return `  ${searchResult.line}: ${searchResult.result}`
        }
      }).join('\n')
      lineNumber += 1
      return `
${fileName}:
${resultsForFile}`
    })
    let header = [`${resultsArray.length} search results found for "${searchQuery.query}"`]
    let content = header.concat(lines)

    return content.join('\n')
  }

  provideDocumentLinks(document) {
    return this.links[document.uri.toString()]
  }

  createDocumentLink(formattedLine, lineNumber, searchQuery, docURI) {
    const {
      file,
      line,
      column
    } = formattedLine
    const col = parseInt(column, 10)
    const preamble = `  ${line}:`.length
    const match = formattedLine.result.match(searchQuery.query)
    if (match == null) {
      return
    }
    const searchTerm = match[0].length
    const linkRange = new vscode.Range(
      lineNumber,
      preamble + col,
      lineNumber,
      preamble + col + searchTerm
    )

    const uri = vscode.Uri.parse(`file:///${file}#${line}`)
    this.links[docURI].push(new vscode.DocumentLink(linkRange, uri))
  }
}

function formatLine(splitLine) {
  return {
    file: splitLine[1],
    line: splitLine[2],
    column: splitLine[3],
    result: splitLine[4]
  }
}

function formatContextLine(splitLine) {
  return {
    file: splitLine[1],
    line: splitLine[2],
    column: undefined,
    result: splitLine[3]
  }
}

function openLink(fileName, line) {
  var params = {
    fileName: fileName,
    line: line
  }
  return encodeURI('command:searchy.openFile?' + JSON.stringify(params))
}

function parseSearchQuery(cmd:string) {
  let searchParts = cmd.match(/^([^:]+):\s?(.*)/);
  let searchPath = "";//searchParts[1];
  let searchQuery = "";// = searchParts[2];

  if(searchParts != null) {
    searchPath = searchParts[0];
    searchQuery = searchParts[1];
  }
  else {
    searchQuery = cmd;
  }

  if(vscode.workspace.rootPath == null)
  {
    vscode.window.showInformationMessage("Open a folder");
  }

  searchPath = path.join(vscode.workspace.rootPath, searchPath);

  return {
    path: searchPath,
    query: searchQuery
  };
}

function runCommandSync(query) {
  return child_process.execSync(`${ripgrep.rgPath} --case-sensitive --line-number --column --hidden --context=2 -e "${query.query}" ${query.path}`, execOpts)
}
