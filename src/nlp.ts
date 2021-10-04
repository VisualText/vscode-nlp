import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { dirfuncs } from './dirfuncs';
import { TextFile, nlpFileType } from './textFile';
import { visualText } from './visualText';
import { logView } from './logView';
import { sequenceView } from './sequenceView';
import { nlpStatusBar, DevMode } from './status';
import { outputView, outputFileType } from './outputView';

export let nlpFile: NLPFile;
export class NLPFile extends TextFile {

	constructor() {
        super();
	}

	analyze(filepath: vscode.Uri) {

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Analyzer text",
			cancellable: false
		}, async (progress, token) => {
            token.onCancellationRequested(() => {
                console.log("User canceled the long running operation");
            });
			
			progress.report({ increment: 10, message: "Clearing log directories" });

			var engineDir = visualText.getEngineDirectory().fsPath;
			var exe = path.join(engineDir,visualText.NLP_EXE);

			if (!fs.existsSync(exe)) {
				visualText.askEngine();
				const p = new Promise<void>((resolve,reject) => {
					reject();
				});
			}

			visualText.readState();
			vscode.commands.executeCommand('workbench.action.files.saveAll');

			// Delete files in output directory
			dirfuncs.emptyDir(visualText.analyzer.getOutputDirectory().fsPath);
			dirfuncs.emptyDir(visualText.analyzer.getLogDirectory().fsPath);

			const filestr = filepath.fsPath;

			progress.report({ increment: 10, message: "Preparing command" });

			var filename = path.basename(filepath.fsPath);
			logView.addMessage('Analyzing '+filename,filepath);
			vscode.commands.executeCommand('logView.refreshAll');
			outputView.setType(outputFileType.TXT);
	
			var pos = filestr.search('input');
			var anapath = filestr.substr(0,pos);
	
			var devFlagStr = nlpStatusBar.getDevMode() == DevMode.DEV ? '-DEV' : '';
			var cmd = `${exe} -ANA ${anapath} -WORK ${engineDir} ${filestr} ${devFlagStr}`;

			progress.report({ increment: 50, message: "Loading KB & Analyzing..." });

			const cp = require('child_process');

			return new Promise(resolve => {
				cp.exec(cmd, (err, stdout, stderr) => {
					console.log('stdout: ' + stdout);
					console.log('stderr: ' + stderr);
					if (err) {
						logView.addMessage(err.message,vscode.Uri.file(filestr));
						vscode.commands.executeCommand('outputView.refreshAll');
						vscode.commands.executeCommand('logView.refreshAll');
						resolve('Failed');
					} else {
						logView.addMessage('Done: '+filename,vscode.Uri.file(filestr));
						vscode.commands.executeCommand('logView.refreshAll');
						//logView.loadMakeAna();
						visualText.analyzer.saveCurrentFile(filepath);
						vscode.commands.executeCommand('textView.refreshAll');
						vscode.commands.executeCommand('outputView.refreshAll');
						vscode.commands.executeCommand('sequenceView.refreshAll');
						vscode.commands.executeCommand('analyzerView.refreshAll');	
						vscode.commands.executeCommand('logView.makeAna');
						resolve('Processed');
					}
				});
			});
		});
	}

	insertRule(ruleStr: string) {
		vscode.window.showTextDocument(this.getUri()).then(editor => {
			let len = this.getText().length
			let pos = editor.document.positionAt(len);
			editor.edit(edit => {
				edit.insert(pos, ruleStr);
			});
		});
	}
	
    searchWord(editor: vscode.TextEditor, functionFlag: boolean = false) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			let cursorPosition = editor.selection.start;
			let wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
			let highlight = editor.document.getText(wordRange);
			sequenceView.search(highlight,functionFlag);
		}
	}

	selectSequence(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			sequenceView.reveal(editor.document.fileName);
		}
	}

    commentLines(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			var start = editor.selection.start;
			var end = editor.selection.end;
			var startLine = start.line;
			var newLineStr: string = '';
			var lastLineLength = 0;

			var lines = this.getSelectedLines(editor);
			if (lines.length) {
				var addingFlag: boolean = false;
				for (let line of lines) {
					// Use first line to determine adding or removing
					if (startLine == start.line) {
						addingFlag = line.charAt(0) == '#' ? false : true;
					}
					var commented: boolean = line.charAt(0) == '#' ? true : false;
					if (addingFlag && !commented && line.length) {
						line = '#' + line;
					} if (!addingFlag && commented) {
						line = line.substr(1);
					}
					if (newLineStr) {
						newLineStr = newLineStr + this.getSeparator();
					}
					newLineStr = newLineStr + line;
					lastLineLength = line.length;
					startLine++;
				}

				if (newLineStr.length) {
					var posStart = new vscode.Position(start.line,0);
					var posEnd = new vscode.Position(end.line,lastLineLength+1);
					var range = new vscode.Range(posStart, posEnd);
	
					var snippet = new vscode.SnippetString(newLineStr);
					editor.insertSnippet(snippet,range);
				}

			}
		}
	}

	reformatRule(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			var rulevars = this.findRuleText(editor);

			if (rulevars[0].length) {
				var formattedRule = this.formatRule(rulevars[0]);
				var rang = new vscode.Selection(rulevars[1].start,rulevars[1].end);
				if (rulevars[1].start.line == rulevars[1].end.line) {
					formattedRule = this.getSeparator() + formattedRule + this.getSeparator() + '\t';
				}
				var snippet = new vscode.SnippetString(formattedRule);
				editor.insertSnippet(snippet,rang);
			}			
		}
	}

	duplicateLine(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			var rulestr = '';
			var position = editor.selection.active;
			var lines = this.getLines(true);
			var line = lines[position.line];
			var posEnd = new vscode.Position(position.line+1,0);
			var rang = new vscode.Selection(posEnd,posEnd);
			var snippet = new vscode.SnippetString(line);
			editor.insertSnippet(snippet,rang);
			editor.selection = rang;
		}
	}

	findRuleText(editor: vscode.TextEditor): [string, vscode.Range] {
		var rulestr = '';
		var position = editor.selection.active;
		var lineStart = position.line;
		var charStart = position.character;
		var lineEnd = position.line;
		var charEnd = position.character;

		var lines = this.getLines(true);
		var line = lines[lineStart];
		var lastline = line;
		var multilined = false;
		var pos = 0;

		while ((pos = line.search('<-')) < 0) {
			rulestr = line + rulestr;
			lastline = line;
			line = lines[--lineStart];
			multilined = true;
		}
		if (lineStart < position.line)
			charStart = 0;
		else
			charStart = pos+3;
		if (multilined)
			lineStart++;

		multilined = false;
		line = lines[lineEnd];
		var firsttime = true;
		while ((pos = line.search('@@')) < 0) {
			if (!firsttime)
				rulestr = rulestr + line;
			lastline = line;
			line = lines[++lineEnd];
			firsttime = false;
		}
		if (!firsttime)	{
			lineEnd--;
			charEnd = lastline.length-1;
		} else {
			charEnd = pos;			
		}

		var posStart = new vscode.Position(lineStart,charStart);
		var posEnd = new vscode.Position(lineEnd,charEnd);
		var range = new vscode.Range(posStart, posEnd);

		if (rulestr.length == 0) {
			rulestr = lastline.substr(charStart,charEnd-charStart);
		}

		return [rulestr,range];
	}

	formatRule(ruleStr: string): string {

		enum state { UNKNOWN, NODE, ATTR_START, ATTR, ATTR_END, COMMENT };

		var formattedRule = ruleStr.replace(this.getSeparatorNormalized(),' ');

		var tokens = ruleStr.split(/\s+/);
		var currentState = state.UNKNOWN;
		var lastState = state.UNKNOWN;
		var lastToken = '';
		var rulelines = new Array();
		var rulelinesFinal = new Array();
		var ruleline = '';
		var maxline = 0;
		const nodeNumRegex = /\([\d]+\)/g;

		for (let token of tokens) {
			if (!token.length)
				continue;

			if (token.localeCompare('###') == 0 || token.match(nodeNumRegex)) {
				currentState = state.COMMENT;

			} else if (currentState as state == state.NODE && token.startsWith('[')) {
				currentState = state.ATTR_START;
				if (token.endsWith(']'))
					currentState = state.ATTR_END;

			} else if (currentState == state.ATTR_START || currentState == state.ATTR ) {
				if (token.endsWith(']'))
					currentState = state.ATTR_END;
				else
					currentState = state.ATTR;

			} else {
				currentState = state.NODE;
			}

			if (currentState != state.COMMENT) {
				if (currentState == state.NODE && (lastState == state.NODE || lastState as state == state.ATTR_END || lastState == state.COMMENT)) {
					if (ruleline.length > maxline)
						maxline = ruleline.length;
					rulelines.push(ruleline);
					ruleline = '';
				}
				if (ruleline.length > 1) {
					ruleline = ruleline + ' ';
				}
				ruleline = ruleline + token;
			}

			lastToken = token;
			lastState = currentState;
		}
		if (ruleline.length > maxline)
			maxline = ruleline.length;
		rulelines.push(ruleline);

		var passnum = 1;
		var tabsize = 4;
		var tabsmax = Math.floor(maxline / tabsize);

		for (var line of rulelines) {
			var tabsline = Math.floor(line.length) / tabsize;
			var tabs = tabsmax - tabsline + 1;
			var tabstr = '\t';
			for (let i=1; i<tabs; i++) {
				tabstr = tabstr + '\t';
			}
			rulelinesFinal.push('\t' + line + tabstr + '### (' + passnum.toString() + ')');
			passnum++;
		}

		formattedRule = rulelinesFinal.join(this.getSeparator());

		return formattedRule;
	}
}