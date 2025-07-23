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
			this.setFile(vscode.Uri.file(filepath), separateLines);
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
			const exe = visualText.exePath().fsPath;
			if (!exe.length || !fs.existsSync(exe)) {
				vscode.window.showErrorMessage("NLP Engine missing", "Download Now").then(response => {
					visualText.startUpdater();
				});
			}

			const engineDir = path.dirname(exe);
			visualText.readState();
			vscode.commands.executeCommand('workbench.action.files.saveAll');

			// Delete files in output directory
			progress.report({ increment: 10, message: "Running..." });

			dirfuncs.emptyDir(visualText.analyzer.getOutputDirectory().fsPath);
			dirfuncs.emptyDir(visualText.analyzer.getLogDirectory().fsPath);

			const filestr = filepath.fsPath;

			visualText.analyzer.setCurrentTextFile(filepath);
			visualText.analyzer.saveAnalyzerState();

			const filename = path.basename(filepath.fsPath);
			const typeStr = dirfuncs.isDir(filepath.fsPath) ? 'directory' : 'file';
			logView.addMessage('Analyzing ' + typeStr + ': ' + filename, logLineType.ANALYER_OUTPUT, filepath);
			vscode.commands.executeCommand('logView.refreshAll');
			outputView.setType(outputFileType.ALL);

			const pos = filestr.search('input');
			const anapath = filestr.substring(0, pos);

			const mode = nlpStatusBar.getDevMode();
			const devFlagStr = mode == DevMode.DEV ? '-DEV' : mode == DevMode.SILENT ? '-SILENT' : '';
			const args: string[] = ['-ANA', '"' + anapath + '"', '-WORK', '"' + engineDir + '"', '"' + filestr + '"', devFlagStr];

			visualText.nlp.setAnalyzerStatus(filepath, analyzerStatus.ANALYZING);

			const cp = require('child_process');

			return new Promise(resolve => {
				nlpStatusBar.analyzerButton(false);
				visualText.processID = cp.execFile(exe, args, (err, stdout, stderr) => {
					const outputDir = path.join(visualText.getCurrentAnalyzer().fsPath, "output");
					const outFile = vscode.Uri.file(path.join(outputDir, 'stdout.log'));
					const errFile = vscode.Uri.file(path.join(outputDir, 'stderr.log'));
					dirfuncs.writeFile(outFile.fsPath, stdout);
					dirfuncs.writeFile(errFile.fsPath, stderr);
					logView.loadAnalyzerOuts();
					console.log('stdout: ' + stdout);
					console.log('stderr: ' + stderr);
					const syntaxError = logView.syntaxErrorsOutput('err.log');
					if (err || syntaxError) {
						if (err)
							logView.addMessage(err.message, logLineType.ANALYER_OUTPUT, vscode.Uri.file(filestr));
						visualText.nlp.setAnalyzerStatus(filepath, analyzerStatus.FAILED);
						nlpStatusBar.resetAnalyzerButton();
						if (syntaxError)
							logView.loadMakeAna();
						else if (!logView.makeAna())
							logView.loadAnalyzerOuts();

						vscode.commands.executeCommand('outputView.refreshAll');
						vscode.commands.executeCommand('logView.refreshAll');
						resolve('Failed');
					} else {
						const typeStr = dirfuncs.isDir(filestr) ? 'directory' : 'file';
						logView.addMessage('Done analyzing ' + typeStr + ': ' + filename, logLineType.ANALYER_OUTPUT, vscode.Uri.file(filestr));
						visualText.analyzer.saveCurrentFile(filepath);
						vscode.commands.executeCommand('textView.refreshAll');
						vscode.commands.executeCommand('outputView.refreshAll');
						vscode.commands.executeCommand('sequenceView.refreshAll');
						vscode.commands.executeCommand('analyzerView.refreshAll');
						vscode.commands.executeCommand('kbView.refreshAll');
						visualText.nlp.setAnalyzerStatus(filepath, analyzerStatus.DONE);
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
		for (const o of visualText.nlp.anaQueue) {
			if (o.uri.fsPath == uri.fsPath) {
				o.status = status;
				break;
			}
		}
	}

	public addAnalyzer(uri: vscode.Uri, type: analyzerType) {
		if (type == analyzerType.FILE) {
			this.anaQueue.push({ uri: uri, operation: analyzerOperation.RUN, status: analyzerStatus.UNKNOWN, type: type });
		} else {
			this.addDirsRecursive(uri, type);
		}
	}

	private addDirsRecursive(dir: vscode.Uri, type: analyzerType) {
		const files = dirfuncs.getFiles(dir);
		if (files.length > 0 && !dirfuncs.directoryIsLog(dir.fsPath)) {
			this.anaQueue.push({ uri: dir, operation: analyzerOperation.RUN, status: analyzerStatus.UNKNOWN, type: type });
		}
		const dirs = dirfuncs.getDirectories(dir);
		for (const subdir of dirs) {
			this.addDirsRecursive(subdir, type);
		}
	}

	public startAnalyzer(mils: number = 100) {
		if (visualText.nlp.timerID == 0) {
			logView.clearLogs(false);
			vscode.commands.executeCommand('logView.clear');
			visualText.debugMessage('Analyzing...', logLineType.ANALYER_OUTPUT);
			visualText.nlp.timerID = +setInterval(this.analyzerTimer, mils);
		}
	}

	analyzerTimer() {
		let op: analyzerRun = visualText.nlp.anaQueue[0];
		const len = visualText.nlp.anaQueue.length;
		let alldone = true;
		let opNum = 0;

		if (visualText.nlp.stopAllFlag) {
			visualText.nlp.shutDown();
			return;
		}

		for (const o of visualText.nlp.anaQueue) {
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
		visualText.debugMessage('Analyzing done', logLineType.ANALYER_OUTPUT);
		visualText.nlp.stopAllFlag = false;
		visualText.nlp.timerID = 0;
		visualText.nlp.anaQueue = [];
	}

	insertRule(ruleStr: string) {
		visualText.colorizeAnalyzer();
		vscode.window.showTextDocument(this.getUri(), { viewColumn: vscode.ViewColumn.Beside }).then(editor => {
			const len = this.getText().length
			const pos = editor.document.positionAt(len);
			editor.edit(edit => {
				edit.insert(pos, ruleStr);
			});
		});
	}

	replaceContext(newContextStr: string, beside: boolean = true) {
		visualText.colorizeAnalyzer();
		if (beside) {
			vscode.window.showTextDocument(this.getUri(), { viewColumn: vscode.ViewColumn.Beside }).then(editor => {
				this.replaceContextLine(newContextStr, editor);
			});
		} else {
			vscode.window.showTextDocument(this.getUri()).then(editor => {
				this.replaceContextLine(newContextStr, editor);
			});
		}
	}

	replaceContextLine(newContextStr: string, editor: vscode.TextEditor) {
		const contextSel = this.findLineSelection(newContextStr);
		if (!contextSel.isEmpty) {
			const snippet = new vscode.SnippetString(newContextStr);
			editor.insertSnippet(snippet, contextSel);
		}
	}

	findLineSelection(line: string): vscode.Selection {
		let contextSel = this.findLineStartsWith('@NODES');
		if (contextSel.isEmpty)
			contextSel = this.findLineStartsWith('@PATH');
		if (contextSel.isEmpty)
			contextSel = this.findLineStartsWith('@MULTI');
		return contextSel;
	}

	replaceContextLineInFile(newContextStr: string) {
		const contextSel = this.findLineSelection(newContextStr);
		const line = contextSel.start.line;
		this.replaceLineNumber(line, newContextStr);
		this.saveFileLines();
	}

	searchWord(editor: vscode.TextEditor, functionFlag: boolean = false) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			const cursorPosition = editor.selection.start;
			const wordRange = editor.document.getWordRangeAtPosition(cursorPosition);
			const highlight = editor.document.getText(wordRange);
			sequenceView.search(highlight, functionFlag);
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
			const passNum = this.passNumberFromAna(editor.document.uri.fsPath);
			sequenceView.openTreeFile(passNum);
		}
	}

	openRuleMatchesText(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			sequenceView.openTreeFileFromPath(editor.document.fileName);
		} else if (this.getFileType() == nlpFileType.TREE) {
			const passNum = this.passNumberFromAna(editor.document.uri.fsPath);
			sequenceView.openRuleMatchFile(passNum);
		}
	}

	passNumberFromAna(filePath: string): number {
		return parseInt(filePath.substring(filePath.length - 8, filePath.length - 5));
	}

	openPassFile(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.TREE || this.getFileType() == nlpFileType.TXXT) {
			const passNum = this.passNumberFromAna(editor.document.uri.fsPath);
			const seqFile = new SequenceFile();
			seqFile.init();
			const passFileUri: vscode.Uri = seqFile.getUriByPassNumber(passNum);
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
			const start = editor.selection.start;
			const end = editor.selection.end;
			let startLine = start.line;
			let newLineStr: string = '';
			let lastLineLength = 0;

			const lines = this.getSelectedLines(editor);
			if (lines.length) {
				let addingFlag: boolean = false;
				for (let line of lines) {
					// Use first line to determine adding or removing
					if (startLine == start.line) {
						addingFlag = line.charAt(0) == '#' ? false : true;
					}
					const commented: boolean = line.charAt(0) == '#' ? true : false;
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
					const posStart = new vscode.Position(start.line, 0);
					const posEnd = new vscode.Position(end.line, lastLineLength + 1);
					const range = new vscode.Range(posStart, posEnd);

					newLineStr = newLineStr.replace(/\$/g, '\\$');
					const snippet = new vscode.SnippetString(newLineStr);
					editor.insertSnippet(snippet, range);
				}

			}
		}
	}

	reformatRule(editor: vscode.TextEditor, type: reformatType) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			const rulevars = this.findRuleText(editor);

			if (rulevars[0].length) {
				const formattedRule = this.formatRule(rulevars[0], type);
				const rang = new vscode.Selection(rulevars[1].start, rulevars[1].end);
				const snippet = new vscode.SnippetString(formattedRule);
				editor.insertSnippet(snippet, rang);
			}
		}
	}

	duplicateLine(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP || this.getFileType() == nlpFileType.DICT || this.getFileType() == nlpFileType.KBB) {
			const rulestr = '';
			const position = editor.selection.active;
			const lines = this.getLines(true);
			let line = lines[position.line];
			const posEnd = new vscode.Position(position.line + 1, 0);
			const rang = new vscode.Selection(posEnd, posEnd);
			line = line.replace(/\$/g, '\\$');
			const snippet = new vscode.SnippetString(line);
			editor.insertSnippet(snippet, rang);
			editor.selection = rang;
		}
	}

	findRuleText(editor: vscode.TextEditor): [string, vscode.Range, boolean, boolean] {
		let rulestr = '';
		const position = editor.selection.active;
		let lineStart = position.line;
		let charStart = position.character;
		let lineEnd = position.line;
		let charEnd = position.character;

		const lines = this.getLines(true);
		let line = lines[lineStart];
		let lastline = line;
		let multilined = false;
		let arrowFlag = false;
		let atSignFlag = false;
		let pos = 0;

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
			charStart = pos + 3;

		multilined = false;
		line = lines[lineEnd];
		let firsttime = true;
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
		const posStart = new vscode.Position(lineStart, charStart);
		const posEnd = new vscode.Position(lineEnd, charEnd);
		const range = new vscode.Range(posStart, posEnd);

		if (rulestr.length == 0) {
			rulestr = lastline.substring(charStart, charEnd - charStart);
		}

		return [rulestr, range, arrowFlag, atSignFlag];
	}

	formatRule(ruleStr: string, type: reformatType = reformatType.NORMAL): string {
		enum state { UNKNOWN, SUGGESTED, ARROW, NODE, NODE_DONE, ATTR, ATTR_END, COMMENT, ATAT };

		let formattedRule = ruleStr.replace(this.getSeparatorNormalized(), ' ');

		const rules: ruleParse[] = [];
		const rulelinesFinal = new Array();
		let words = new Array();
		let currentState = state.UNKNOWN;
		let word = '';
		let isSpace = false;
		let lastSpace = false;
		let backSlash = false;
		let suggested = false;
		let c = '';
		let cNext = '';

		// Parse rule string
		for (let i = 0; i < ruleStr.length; i++) {
			c = ruleStr[i];
			cNext = i < ruleStr.length - 1 ? ruleStr[i + 1] : '';
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
				rules.push({ suggested: words[0], rule: '', comment: '' });
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
				this.constructLine(rules, words, type);
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
				this.constructLine(rules, words, type);
				words = [];
				word = '';
				currentState = state.NODE;

				// Is a new node on the same line?
			} else if (currentState == state.ATTR_END && !isSpace) {
				this.constructLine(rules, words, type);
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
			this.constructLine(rules, words, type);

		// Find longest line
		let maxLine = 0;
		let maxComment = 0;
		for (const rule of rules) {
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
		const tabsize = 4;
		const tabsMax = Math.floor(maxLine / tabsize);
		const tabsCommentMax = Math.floor(maxComment / tabsize);
		let nodeNumber = 1;
		let ruleLine = '';
		let hasAtAt = false;
		for (const rule of rules) {
			if (rule.rule == '@@') {
				ruleLine = type == reformatType.ONELINE ? '@@' : '\t@@';
				hasAtAt = true;
			} else if (rule.suggested.length) {
				ruleLine = rule.suggested + ' <-';
			} else {
				const tabstr = this.tabString(rule.rule.length, tabsize, tabsMax);
				const tabCommentStr = this.tabString(rule.comment.length, tabsize, tabsCommentMax);
				const commentStr = rule.comment.length ? rule.comment + ' \t' : tabsCommentMax > 0 ? tabCommentStr : '';
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

		const sep = type == reformatType.ONELINE ? '' : this.getSeparator();
		formattedRule = rulelinesFinal.join(sep);

		return formattedRule;
	}

	tabString(length: number, tabsize: number, tabsmax: number): string {
		const tabsline = Math.floor(length) / tabsize;
		const tabs = tabsmax - tabsline + 1;
		let tabstr = '\t';
		for (let i = 1; i < tabs; i++) {
			tabstr = tabstr + '\t';
		}
		return tabstr;
	}

	constructLine(rules, words: string[], type: reformatType) {
		// Check for user  or auto-generated comment
		const lastOne = words[words.length - 1];
		const second = lastOne.substring(1, lastOne.length - 1);
		const parsed = parseInt(second);
		const isNumeric = isNaN(parsed) ? false : true;
		const lastIsNodeNumber = lastOne.startsWith('(') && lastOne.endsWith(')') && isNumeric ? true : false;
		let commentStart = 0;
		let userComment = '';
		let found = false;
		commentStart = words.length - 1;
		for (const word of words.reverse()) {
			if (word.startsWith('#')) {
				found = true;
				break;
			}
			commentStart--;
		}
		words.reverse();
		let word = '';  // Declare word here
		if (found) {
			const end = lastIsNodeNumber ? words.length - 1 : words.length;
			for (let i = commentStart + 1; i < end; i++) {
				word = words[i];
				if (userComment.length)
					userComment += ' ';
				userComment += word;
			}
		}

		// Construct Line
		if (!words.length)
			return '';
		let line = '';
		let nextWord = '';
		let lastWord = '';
		let parenFlag = false;

		for (let i = 0; i < words.length; i++) {
			if (commentStart && i == commentStart)
				break;
			word = words[i];
			nextWord = i < words.length - 1 ? words[i + 1] : '';

			if (type == reformatType.PARENS && (word == '(' || word == ')')) {
				parenFlag = word == '(' ? true : false;
				if (word == ')')
					line += '\n\t\t';
			} else if (parenFlag) {
				line += '\n\t\t\t';
			}
			line += word;
			if (i < words.length - 1 && word != '[' && word != '(' && !word.endsWith('=')
				&& nextWord != ')' && nextWord != ']' && nextWord != '='
				&& lastWord != '=')
				line += ' ';
			lastWord = word;
		}
		const ruleLine = type == reformatType.ONELINE ? line : line.trimEnd();
		rules.push({ suggested: '', rule: ruleLine, comment: userComment });
	}

	copyContext(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.NLP) {
			sequenceView.replaceContext(editor.document.fileName);
		}
	}

	getContextLine(uri: vscode.Uri) {
		this.setFile(uri);
		let contextLine = '';
		for (const line of this.getLines()) {
			if (line.startsWith('@NODES') || line.startsWith('@PATH') || line.startsWith('@MULTI')) {
				contextLine = line;
				break;
			}
		}
		return contextLine;
	}
}
