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
  searchProc = null;
  content:string = "";
  buffer:string = "";
  resultsByFile = {};
  onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	onDidChange = this.onDidChangeEmitter.event;
  links:Array<Array<vscode.DocumentLink>> = [];
  _subscriptions: vscode.Disposable;

  constructor() {
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

  provideTextDocumentContent(uri:vscode.Uri) {
    if(this.content == "") {
      let uriString:string = uri.toString()
      this.links[uriString] = [];
      const params = querystring.parse(uri.query)
      const cmd = params.cmd

      let searchQuery = parseSearchQuery(cmd);
      let searchResults = null
      try {
        searchResults = this.runCommandAsync(searchQuery, uri)
      } catch (err) {
        return `${err}`
      }
    }

    return this.content;
  }

  runCommandAsync(searchQuery, uriString) {
    let my = this;
    my.searchProc = child_process.exec(`${ripgrep.rgPath} --case-sensitive --line-number --column --hidden --context=2 -e "${searchQuery.query}" ${searchQuery.path}`, execOpts)
    my.searchProc.stdout.on("data", data => {

      if (!data.length) {
        return;
      }

      // Update content
      my.buffer += data;
      let lastNewline = my.buffer.lastIndexOf("\n");

      if(lastNewline == -1) { 
        return;
      }

      let resultsArray = my.buffer.substr(0, lastNewline + 1).split('\n');
      my.buffer = my.buffer.substr(lastNewline + 1);

      // Filter out empty lines
      resultsArray = resultsArray.filter((item) => {
        return item != null && item.length > 0
      })

      let lastFormattedLine;
  
      var addFormattedLine = function(formattedLine) {
        // Add the file for the result to the file results array if it doesn't already exist
        if (! my.resultsByFile.hasOwnProperty(formattedLine.file)) {
           my.resultsByFile[formattedLine.file] = [];
        }
        
        my.resultsByFile[formattedLine.file].push(formattedLine);
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
        for (var file in my.resultsByFile) {
          let lines = my.resultsByFile[file];
          if (lines[lines.length - 1].seperator) {
            lines.splice(lines.length - 1, 1);
            my.resultsByFile[file] = lines;
          }
        }
      };
  
      removeTrailingSeperators();
  
      let sortedFiles = Object.keys(my.resultsByFile).sort()
      let lineNumber = 1
  
      let lines = sortedFiles.map((fileName) => {
        lineNumber += 1
        let resultsForFile = my.resultsByFile[fileName].map((searchResult, index) => {
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
      my.content += lines + "\n";//header.concat(lines) + "\n\n\n";
  
      // Fire event
      my.onDidChangeEmitter.fire(uriString);
    });
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
