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
export enum reformatType { NORMAL, ONELINE, PARENS }

interface analyzerRun {
    uri: vscode.Uri;
    operation: analyzerOperation;
    status: analyzerStatus;
    type: analyzerType;
}

interface ruleParse {
	suggested: string,
    rule: string,
    comment: string
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
	
			var mode = nlpStatusBar.getDevMode();
			var devFlagStr = mode == DevMode.DEV ? '-DEV' : mode == DevMode.SILENT ? '-SILENT' : '';
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
					var syntaxError = logView.syntaxErrorsOutput('err.log');
					if (err || syntaxError) {
						if (err)
							logView.addMessage(err.message,logLineType.ANALYER_OUTPUT,vscode.Uri.file(filestr));
						visualText.nlp.setAnalyzerStatus(filepath,analyzerStatus.FAILED);
						nlpStatusBar.resetAnalyzerButton();
						logView.makeAna();

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

	reformatRule(editor: vscode.TextEditor, type: reformatType) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			var rulevars = this.findRuleText(editor);

			if (rulevars[0].length) {
				var formattedRule = this.formatRule(rulevars[0],type);
				var rang = new vscode.Selection(rulevars[1].start,rulevars[1].end);
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
		rulestr = line + rulestr;
		if (lineStart < position.line)
			charStart = 0;
		else
			charStart = pos+3;

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
		rulestr += line;
		charEnd = pos + 2;			

		charStart = 0;
		var posStart = new vscode.Position(lineStart,charStart);
		var posEnd = new vscode.Position(lineEnd,charEnd);
		var range = new vscode.Range(posStart, posEnd);

		if (rulestr.length == 0) {
			rulestr = lastline.substring(charStart,charEnd-charStart);
		}

		return [rulestr, range, arrowFlag, atSignFlag];
	}

	formatRule(ruleStr: string, type: reformatType = reformatType.NORMAL): string {
		enum state { UNKNOWN, SUGGESTED, ARROW, NODE, NODE_DONE, ATTR, ATTR_END, COMMENT, ATAT };

		var formattedRule = ruleStr.replace(this.getSeparatorNormalized(),' ');

		var rules: ruleParse[] = [];
		var rulelinesFinal = new Array();
		var words = new Array();
		var currentState = state.UNKNOWN;
		var word = '';
		var isSpace = false;
		var lastSpace = false;
		var backSlash = false;
		var suggested = false;
		var c = '';
		var cNext = '';

		// Parse rule string
		for (let i=0; i < ruleStr.length; i++) {
			c = ruleStr[i];
			cNext = i < ruleStr.length - 1 ? ruleStr[i+1] : '';
			isSpace = !/\S/.test(c);

			if (backSlash) {
				word += c;
				backSlash = false;
				continue;
			}
			backSlash = c == '\\' ? true : false;

			// Skip more than one space
			if (isSpace && lastSpace && c != '\n')
				continue;

			// Waiting for next or first node
			if (currentState == state.UNKNOWN && !isSpace) {
				currentState = suggested ? state.NODE : state.SUGGESTED;
				suggested = true;

			// @@
			} else if (c == '@' && cNext == '@') {
				if (word.length)
					words.push(word);
				break;
		
			// <-
			} else if (currentState == state.SUGGESTED && c == '<' && cNext == '-') {
				if (word.length)
					words.push(word);
				words.push('<-');
				rules.push({suggested: words[0], rule: '', comment: ''});
				words = [];
				word = '';
				currentState = state.ARROW;
				i++;
				continue;
				
			// First node after arrow
			} else if (currentState == state.ARROW && !isSpace) {
				currentState = state.NODE;

			// Finished picking up the first node in a rule line
			} else if (currentState == state.NODE && (isSpace || c == '[')) {
				currentState = state.NODE_DONE;
				words.push(word);
				word = '';
				if (c == '[') {
					words.push(c);
					currentState = state.ATTR;
					word = '';
					continue;
				}

			// Found starting attribute bracket
			} else if (currentState == state.NODE_DONE && c == '[') {
				words.push(c);
				currentState = state.ATTR;
				word = '';
				continue;

			// If you have one node followed immediately by another or a new line
			} else if (currentState == state.NODE_DONE && (c == '\n' || (!isSpace && c != '[' && c != '#'))) {
				if (word.length) {
					words.push(word);
				}
				this.constructLine(rules,words,type);
				words = [];
				word = '';
				currentState = state.NODE;

			// Ending a bracketed attribute area
			} else if (currentState == state.ATTR && c == ']') {
				if (word.length)
					words.push(word);
				words.push(c);
				word = '';
				currentState = state.ATTR_END;
				continue;

			// Ending a bracketed attribute area
			} else if (currentState == state.ATTR && (c == ')' || c == '(')) {
				if (word.length)
					words.push(word);
				words.push(c);
				word = '';
				continue;

			// Is a comment
			} else if (currentState == state.ATTR_END && c == '#') {
				currentState = state.COMMENT;

			// New line
			} else if ((currentState == state.NODE || currentState == state.COMMENT || currentState == state.ATTR_END) && c == '\n') {
				if (word.length)
					words.push(word);
				this.constructLine(rules,words,type);
				words = [];
				word = '';
				currentState = state.NODE;
			
			// Is a new node on the same line?
			} else if (currentState == state.ATTR_END && !isSpace) {
				this.constructLine(rules,words,type);
				words = [];
				word = '';
				currentState = state.UNKNOWN;
			}

			if (!isSpace) {
				word += c;
			} else if (word.length && isSpace && !lastSpace) {
				if (word.startsWith('#'))
					currentState = state.COMMENT;
				words.push(word);
				word = '';
			}

			lastSpace = isSpace;
		}

		if (words.length)
			this.constructLine(rules,words,type);

		// Find longest line
		var maxLine = 0;
		var maxComment = 0;
		for (let rule of rules) {
			let total = rule.rule.length;
			if (total > maxLine)
				maxLine = total;
			total = rule.comment.length;
			if (total > maxComment)
				maxComment = total;
		}
		if (maxComment)
			maxComment += 1;  // For space after user comment

		// Construct reformated string
		var tabsize = 4;
		var tabsMax = Math.floor(maxLine / tabsize);
		var tabsCommentMax = Math.floor(maxComment / tabsize);
		var nodeNumber = 1;
		var ruleLine = '';
		var hasAtAt = false;
		for (let rule of rules) {
			if (rule.rule == '@@') {
				ruleLine = type == reformatType.ONELINE ? '@@' : '\t@@';
				hasAtAt = true;
			} else if (rule.suggested.length) {
				ruleLine = rule.suggested + ' <-';
			} else {
				let tabstr = this.tabString(rule.rule.length,tabsize,tabsMax);
				let tabCommentStr = this.tabString(rule.comment.length,tabsize,tabsCommentMax);
				let commentStr = rule.comment.length ? rule.comment + ' \t' : tabsCommentMax > 0 ? tabCommentStr : '';
				if (type == reformatType.ONELINE)
					ruleLine = rule.rule;
				else
					ruleLine = '\t' + rule.rule + tabstr + '### ' + commentStr + '(' + nodeNumber.toString() + ')';	
				nodeNumber++;			
			}
			rulelinesFinal.push(ruleLine);
		}
		if (!hasAtAt)
			rulelinesFinal.push('\t@@');

		var sep = type == reformatType.ONELINE ? '' : this.getSeparator();
		formattedRule = rulelinesFinal.join(sep);

		return formattedRule;
	}

	tabString(length: number, tabsize: number, tabsmax: number): string {
		var tabsline = Math.floor(length) / tabsize;
		var tabs = tabsmax - tabsline + 1;
		var tabstr = '\t';
		for (let i=1; i<tabs; i++) {
			tabstr = tabstr + '\t';
		}
		return tabstr;
	}

	constructLine(rules, words: string[], type: reformatType)  {
		// Check for user  or auto-generated comment
		var lastOne = words[words.length-1];
		var second = lastOne.substring(1,lastOne.length-1);
		const parsed = parseInt(second);
		var isNumeric = isNaN(parsed) ? false : true;
		var lastIsNodeNumber = lastOne.startsWith('(') && lastOne.endsWith(')') && isNumeric ? true : false;
		var commentStart = 0;
		var userComment = '';
		var found = false;
		commentStart = words.length - 1;
		for (let word of words.reverse()) {
			if (word.startsWith('#')) {
				found = true;
				break;
			}
			commentStart--;
		}
		words.reverse();
		if (found) {
			var end = lastIsNodeNumber ? words.length - 1 : words.length;
			for (let i=commentStart+1; i < end; i++) {
				word = words[i];
				if (userComment.length)
					userComment += ' ';
				userComment += word;
			}			
		}

		// Construct Line
		if (!words.length)
			return '';
		var line = '';
		var word = '';
		var nextWord = '';
		var lastWord = '';
		var parenFlag = false;

		for (let i=0; i < words.length; i++) {
			if (commentStart && i == commentStart)
				break;
			word = words[i];
			nextWord = i < words.length-1 ? words[i+1] : '';

			if (type == reformatType.PARENS && (word == '(' || word == ')')) {
				parenFlag = word == '(' ? true : false;
				if (word == ')')
					line += '\n\t\t';
			} else if (parenFlag) {
				line += '\n\t\t\t';
			}
			line += word;
			if (i < words.length-1 && word != '[' && word != '(' && !word.endsWith('=')
				 && nextWord != ')' && nextWord != ']' && nextWord != '='
				 && lastWord != '=')
				line += ' ';
			lastWord = word;
		}
		var ruleLine = type == reformatType.ONELINE ? line : line.trimEnd();
		rules.push({suggested: '', rule: ruleLine, comment: userComment});
	}

	copyContext(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			sequenceView.replaceContext(editor.document.fileName);
		}
	}
}