import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { dirfuncs } from './dirfuncs';
import { TextFile, nlpFileType } from './textFile';
import { visualText } from './visualText';
import { logView, logLineType } from './logView';
import { SequenceFile } from './sequence';
import { sequenceView } from './sequenceView';
import { nlpStatusBar, DevMode } from './status';
import { outputView, outputFileType } from './outputView';

export enum anaQueueStatus { UNKNOWN, RUNNING, DONE, FAILED }
export enum analyzerStatus { UNKNOWN, ANALYZING, DONE, FAILED }
export enum analyzerOperation { UNKNOWN, RUN, STOP }
export enum analyzerType { UNKNOWN, FILE, DIRECTORY }

interface analyzerRun {
    uri: vscode.Uri;
    operation: analyzerOperation;
    status: analyzerStatus;
    type: analyzerType;
}

export let nlpFile: NLPFile;
export class NLPFile extends TextFile {

	public anaQueue: analyzerRun[] = new Array();
    public timerStatus: anaQueueStatus = anaQueueStatus.UNKNOWN;
	private timerID = 0;
	private stopAllFlag: boolean = false;

	constructor(filepath: string = '', separateLines: boolean = true, text: string = '') {
		super();
        if (text.length)
            this.setText(text, separateLines);
        else if (filepath.length)
            this.setFile(vscode.Uri.file(filepath),separateLines);
    }

	analyze(filepath: vscode.Uri) {
		
		if (visualText.processID) {
			vscode.window.showWarningMessage("Analyzer already running");
			return;
		}

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Analyzer",
			cancellable: true
		}, async (progress, token) => {
            token.onCancellationRequested(() => {
				nlpStatusBar.analyzerButton();
				visualText.nlp.stopAll();
                console.log("User canceled analyzer");
				return;
            });

			// Check to see if the engine executable is there
			var exe = visualText.exePath().fsPath;
			if (!exe.length || !fs.existsSync(exe)) {
				vscode.window.showErrorMessage("NLP Engine missing", "Download Now").then(response => {
					visualText.startUpdater();
				});
			}

			var engineDir = path.dirname(exe);
			visualText.readState();
			vscode.commands.executeCommand('workbench.action.files.saveAll');

			// Delete files in output directory
			progress.report({ increment: 10, message: "Running..." });

			dirfuncs.emptyDir(visualText.analyzer.getOutputDirectory().fsPath);
			dirfuncs.emptyDir(visualText.analyzer.getLogDirectory().fsPath);

			const filestr = filepath.fsPath;

			visualText.analyzer.setCurrentTextFile(filepath);
			visualText.analyzer.saveAnalyzerState();

			var filename = path.basename(filepath.fsPath);
			var typeStr = dirfuncs.isDir(filepath.fsPath) ? 'directory' : 'file';
			logView.addMessage('Analyzing '+typeStr+': '+filename, logLineType.ANALYER_OUTPUT, filepath);
			vscode.commands.executeCommand('logView.refreshAll');
			outputView.setType(outputFileType.ALL);
	
			var pos = filestr.search('input');
			var anapath = filestr.substring(0,pos);
	
			var devFlagStr = nlpStatusBar.getDevMode() == DevMode.DEV ? '-DEV' : '-SILENT';
			var args: string[] = ['-ANA','"'+anapath+'"','-WORK','"'+engineDir+'"','"'+filestr+'"',devFlagStr];

			visualText.nlp.setAnalyzerStatus(filepath,analyzerStatus.ANALYZING);

			const cp = require('child_process');

			return new Promise(resolve => {
				nlpStatusBar.analyzerButton(false);
				visualText.processID = cp.execFile(exe, args, (err, stdout, stderr) => {
					let outputDir = path.join(visualText.getCurrentAnalyzer().fsPath,"output");
					let outFile = vscode.Uri.file(path.join(outputDir,'stdout.log'));
					let errFile = vscode.Uri.file(path.join(outputDir,'stderr.log'));
					dirfuncs.writeFile(outFile.fsPath,stdout);
					dirfuncs.writeFile(errFile.fsPath,stderr);
					logView.loadAnalyzerOuts();
					console.log('stdout: ' + stdout);
					console.log('stderr: ' + stderr);
					if (err || logView.syntaxErrors()) {
						if (err)
							logView.addMessage(err.message,logLineType.ANALYER_OUTPUT,vscode.Uri.file(filestr));
						visualText.nlp.setAnalyzerStatus(filepath,analyzerStatus.FAILED);
						nlpStatusBar.resetAnalyzerButton();
						vscode.commands.executeCommand('outputView.refreshAll');
						vscode.commands.executeCommand('logView.refreshAll');
						resolve('Failed');
					} else {
						var typeStr = dirfuncs.isDir(filestr) ? 'directory' : 'file';
						logView.addMessage('Done analyzing '+typeStr+': '+filename,logLineType.ANALYER_OUTPUT,vscode.Uri.file(filestr));
						visualText.analyzer.saveCurrentFile(filepath);
						vscode.commands.executeCommand('textView.refreshAll');
						vscode.commands.executeCommand('outputView.refreshAll');
						vscode.commands.executeCommand('sequenceView.refreshAll');
						vscode.commands.executeCommand('analyzerView.refreshAll');
						vscode.commands.executeCommand('kbView.refreshAll');
						visualText.nlp.setAnalyzerStatus(filepath,analyzerStatus.DONE);
						nlpStatusBar.resetAnalyzerButton();
						resolve('Processed');
					}
				}).pid;
			});
		});
	}

    public stopAll() {
        visualText.nlp.stopAllFlag = true;
    }

	public setAnalyzerStatus(uri: vscode.Uri, status: analyzerStatus) {
        for (let o of visualText.nlp.anaQueue) {
            if (o.uri.fsPath == uri.fsPath) {
                o.status = status;
				break;
            }
        }
	}
	
	public addAnalyzer(uri: vscode.Uri, type: analyzerType) {
		if (type == analyzerType.FILE) {
			this.anaQueue.push({uri: uri, operation: analyzerOperation.RUN, status: analyzerStatus.UNKNOWN, type: type});
		} else {
			this.addDirsRecursive(uri,type);
		}
	}

	private addDirsRecursive(dir: vscode.Uri, type: analyzerType) {
		var files = dirfuncs.getFiles(dir);
		if (files.length > 0 && !dirfuncs.directoryIsLog(dir.fsPath)) {
			this.anaQueue.push({uri: dir, operation: analyzerOperation.RUN, status: analyzerStatus.UNKNOWN, type: type});
		}
        var dirs = dirfuncs.getDirectories(dir);
        for (let subdir of dirs) {
			this.addDirsRecursive(subdir,type);
        }
    }
	
    public startAnalyzer(mils: number=100) {
        if (visualText.nlp.timerID == 0) {
			vscode.commands.executeCommand('logView.clear');
            visualText.debugMessage('Analyzing...',logLineType.ANALYER_OUTPUT);
            visualText.nlp.timerID = +setInterval(this.analyzerTimer,mils);
        }
    }

	analyzerTimer() {
        let op: analyzerRun = visualText.nlp.anaQueue[0];
        let len = visualText.nlp.anaQueue.length;
        let alldone = true;
        let opNum = 0;

		if (visualText.nlp.stopAllFlag) {
			visualText.nlp.shutDown();
			return;
		}

        for (let o of visualText.nlp.anaQueue) {
            opNum++;
            if (o.status == analyzerStatus.UNKNOWN || o.status == analyzerStatus.ANALYZING) {
                op = o;
                alldone = false;
                break;
            }
            else if (o.status != analyzerStatus.FAILED && o.status != analyzerStatus.DONE) {
                alldone = false;
            }
        }
        if (alldone) {
            vscode.commands.executeCommand('setContext', 'anaOps.running', false);
            visualText.nlp.stopAllFlag = false;
            visualText.nlp.timerStatus = anaQueueStatus.DONE;
        } else {
            vscode.commands.executeCommand('setContext', 'anaOps.running', true);
            visualText.nlp.timerStatus = anaQueueStatus.RUNNING;
        }

		//SIMPLE STATE MACHINE
		switch (visualText.nlp.timerStatus) {
			case anaQueueStatus.RUNNING: {
				if (op.status == analyzerStatus.UNKNOWN) {
					switch (op.operation) {
						case analyzerOperation.RUN: {
							op.status = analyzerStatus.ANALYZING;
							visualText.nlp.analyze(op.uri);
							break;
						}
					}
				}
				break;
			}
			case anaQueueStatus.DONE: {
				visualText.nlp.shutDown();
				break;
			}
		}
	}

	shutDown() {
		clearInterval(visualText.nlp.timerID);
		visualText.debugMessage('Analyzing done',logLineType.ANALYER_OUTPUT);
		visualText.nlp.stopAllFlag = false;
		visualText.nlp.timerID = 0;
		visualText.nlp.anaQueue = [];
	}

	insertRule(ruleStr: string) {
		visualText.colorizeAnalyzer();
		vscode.window.showTextDocument(this.getUri(), { viewColumn: vscode.ViewColumn.Beside }).then(editor => {
			let len = this.getText().length
			let pos = editor.document.positionAt(len);
			editor.edit(edit => {
				edit.insert(pos, ruleStr);
			});
		});
	}

	replaceContext(newContextStr: string, beside: boolean=true) {
		visualText.colorizeAnalyzer();
		if (beside) {
			vscode.window.showTextDocument(this.getUri(), { viewColumn: vscode.ViewColumn.Beside }).then(editor => {
				this.replaceContextLine(newContextStr,editor);
			});
		} else {
			vscode.window.showTextDocument(this.getUri()).then(editor => {
				this.replaceContextLine(newContextStr,editor);
			});
		}
	}

	replaceContextLine(newContextStr: string, editor: vscode.TextEditor) {
		let contextSel = this.findLineStartsWith('@NODES');
		if (contextSel.isEmpty)
			contextSel = this.findLineStartsWith('@PATH');
		if (contextSel.isEmpty)
			contextSel = this.findLineStartsWith('@MULTI');
		if (!contextSel.isEmpty) {
			var snippet = new vscode.SnippetString(newContextStr);
			editor.insertSnippet(snippet,contextSel);
		}
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
		
	passTree(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			sequenceView.passTree(editor.document.fileName);
		} else if (this.getFileType() == nlpFileType.TXXT) {
			let passNum = this.passNumberFromAna(editor.document.uri.fsPath);
			sequenceView.openTreeFile(passNum);
		}
	}
			
	openRuleMatchesText(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			sequenceView.openTreeFileFromPath(editor.document.fileName);
		} else if (this.getFileType() == nlpFileType.TREE) {
			let passNum = this.passNumberFromAna(editor.document.uri.fsPath);
			sequenceView.openRuleMatchFile(passNum);
		}
	}

	passNumberFromAna(filePath: string): number {
		return parseInt(filePath.substring(filePath.length-8,filePath.length-5));
	}

	openPassFile(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.TREE || this.getFileType() == nlpFileType.TXXT) {
			let passNum = this.passNumberFromAna(editor.document.uri.fsPath);
			var seqFile = new SequenceFile();
			seqFile.init();
			let passFileUri: vscode.Uri = seqFile.getUriByPassNumber(passNum);
			if (fs.existsSync(passFileUri.fsPath)) {
				visualText.colorizeAnalyzer();
				vscode.window.showTextDocument(passFileUri);
			}
			else
				vscode.window.showWarningMessage('No pass file ' + path.basename(passFileUri.fsPath));
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
						line = line.substring(1);
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
	
					newLineStr = newLineStr.replace(/\$/g,'\\$');
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
				if (!rulevars[2]) {
					formattedRule = this.getSeparator() + formattedRule;
				}
				if (!rulevars[3]) {
					formattedRule = formattedRule + this.getSeparator() + '\t';
				}
				var snippet = new vscode.SnippetString(formattedRule);
				editor.insertSnippet(snippet,rang);
			}			
		}
	}

	duplicateLine(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP || this.getFileType() == nlpFileType.DICT || this.getFileType() == nlpFileType.KBB) {
			var rulestr = '';
			var position = editor.selection.active;
			var lines = this.getLines(true);
			var line = lines[position.line];
			var posEnd = new vscode.Position(position.line+1,0);
			var rang = new vscode.Selection(posEnd,posEnd);
			line = line.replace(/\$/g,'\\$');
			var snippet = new vscode.SnippetString(line);
			editor.insertSnippet(snippet,rang);
			editor.selection = rang;
		}
	}

	findRuleText(editor: vscode.TextEditor): [string, vscode.Range, boolean, boolean] {
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
		var arrowFlag = false;
		var atSignFlag = false;
		var pos = 0;

		while ((pos = line.search('<-')) < 0) {
			rulestr = line + rulestr;
			lastline = line;
			line = lines[--lineStart];
			multilined = true;
			arrowFlag = true;
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
			atSignFlag = true;
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
			rulestr = lastline.substring(charStart,charEnd-charStart);
		}

		return [rulestr,range, arrowFlag, atSignFlag];
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

	copyContext(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			sequenceView.replaceContext(editor.document.fileName);
		}
	}
}