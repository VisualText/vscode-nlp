import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { TextFile, nlpFileType } from './textFile';
import { NLPFile } from './nlp';
import { nlpStatusBar, FiredMode } from './status';
import { SequenceFile } from './sequence';
import { FindFile, FindItem } from './findFile';
import { findView } from './findView';
import { dirfuncs } from './dirfuncs';
import * as os from 'os';

export enum generateType { GENERAL, EXACT }

export interface Highlight {
	start: number;
	end: number;
	startb: number;
	endb: number;
}

export interface Fired {
	str: string;
	from: number;
	to: number;
	ufrom: number;
	uto: number;
	rulenum: number;
	ruleline: number;
	built: boolean;
}

export interface TreeLine {
	node: string
	start: number;
	end: number;
	ustart: number;
	uend: number;
	passNum: number;
	ruleLine: number;
	type: string;
	rest: string;
	fired: boolean;
	built: boolean;
	indent: number;
}

export let treeFile: TreeFile;
export class TreeFile extends TextFile {

	private fireds: Fired[] = [];
	private Highlight: Highlight[] = [];
	private selectedTreeStr = '';
	private selStart = -1;
	private selEnd = -1;
	private treeFile = '';
	private HighlightFile = '';
	private inputFile = '';
	private selectedLines: TreeLine[] = [];
	private findFile = new FindFile();

	constructor() {
		super();
	}

	ruleFired(editor: vscode.TextEditor) {
		if (visualText.analyzer.hasText()) {
			this.setFile(editor.document.uri);
			this.parseTreeLines(editor);
			if (this.selStart >= 0) {
				const tline = this.selectedLines[0];
				const passNum = tline.passNum;
				if (passNum) {
					const seqFile = new SequenceFile();
					seqFile.init();
					const passFile = seqFile.getUriByPassNumber(passNum);
					visualText.colorizeAnalyzer();
					vscode.window.showTextDocument(passFile, { viewColumn: vscode.ViewColumn.Beside }).then(edit => {
						const pos = new vscode.Position(this.selectedLines[0].ruleLine - 1, 0);
						const range = new vscode.Range(pos, pos);
						edit.selections = [new vscode.Selection(pos, pos)];
						edit.revealRange(range);
					});

					// If 0,0, then search inside dictionary files
				} else if (tline.ruleLine == 0) {
					this.searchInDictionaries(tline.node);
				}
			}
		}
	}

	searchInDictionaries(word: string) {
		const finalMatches: FindItem[] = [];
		let searchWord = word.toLowerCase();
		let str = searchWord;

		if (searchWord.startsWith('_')) {
			searchWord = word.substring(1);
			str = this.gatherChildrenText();
			if (searchWord == 'phrase') {
				searchWord = str;
			} else {
				searchWord = 's=' + word.substring(1);
			}
		}

		this.findFile.searchFiles(visualText.analyzer.getKBDirectory(), searchWord, ['.dict'], 0, false, false);
		const matches = this.findFile.getMatches();

		for (const match of matches) {
			if (this.matchDictLine(str, match.highlighted)) {
				finalMatches.push(match);
			}
		}

		// Display the find(s)
		if (finalMatches.length >= 1) {
			findView.openFile(finalMatches[0]);
			findView.loadFinds(searchWord, finalMatches);
			findView.setSearchWord(searchWord);
			vscode.commands.executeCommand('findView.updateTitle');
			vscode.commands.executeCommand('findView.refreshAll');
		}
	}

	matchDictLine(original: string, line: string): boolean {
		const tokens = line.split('=');
		if (tokens.length > 1) {
			const toks = tokens[0].split('\s');
			const lastIndex: number = tokens[0].lastIndexOf(" ");
			const str = tokens[0].substring(0, lastIndex);
			return str.localeCompare(original, undefined, { sensitivity: 'base' }) == 0;
		}
		return false;
	}

	gatherChildrenText(): string {
		let str = '';
		const lines = this.getLines();
		if (lines.length > this.selStartLine) {
			let i = this.selStartLine + 1;
			const indent = this.selectedLines[0].indent;
			while (i < lines.length) {
				const line = lines[i++];
				const treeLine = this.parseTreeLine(line);
				if (treeLine.indent > indent) {
					str += ' ' + treeLine.node;
				} else {
					break;
				}
			}
		}
		str = str.toLocaleLowerCase().trim();
		return str;
	}

	highlightText(editor: vscode.TextEditor) {
		if (visualText.analyzer.hasText()) {
			this.setFile(editor.document.uri);
			this.parseTreeLines(editor);
			if (this.selStart >= 0) {
				visualText.colorizeAnalyzer();
				vscode.window.showTextDocument(visualText.analyzer.getTextPath(), { viewColumn: vscode.ViewColumn.Beside }).then(edit => {
					const txt = new TextFile(visualText.analyzer.getTextPath().fsPath);
					const posStart = txt.positionAt(this.selStart - 1);
					const posEnd = txt.positionAt(this.selEnd);
					const range = new vscode.Range(posStart, posEnd);
					edit.selections = [new vscode.Selection(posStart, posEnd)];
					edit.revealRange(range);
				});
			}
		}
	}

	generatePath(editor: vscode.TextEditor) {
		if (visualText.analyzer.hasText()) {
			const passFileUri = this.getPassFromPath(editor);
			if (passFileUri.fsPath.length > 2) {
				this.setFile(editor.document.uri);
				this.parseTreeLines(editor);

				if (this.selStart >= 0) {
					let pathStr = '';
					let treeLine = this.selectedLines[0];

					if (treeLine) {
						let start = this.getStartLine();
						let lastIndent = treeLine.indent + 1;
						while (treeLine.indent > 0) {
							const line = this.getLines()[start--];
							treeLine = this.parseTreeLine(line);
							if (treeLine.indent < lastIndent) {
								pathStr = treeLine.node + ' ' + pathStr;
								lastIndent = treeLine.indent;
							}
						}
					}
					pathStr = '@PATH ' + pathStr.trim();

					const nlp = new NLPFile();
					nlp.setFile(passFileUri);
					nlp.replaceContext(pathStr);
				}
				else {
					vscode.window.showInformationMessage('No text selected');
				}
			} else {
				vscode.window.showInformationMessage('Must not be the final tree');
			}
		}
	}

	public getPassFromPath(editor: vscode.TextEditor): vscode.Uri {
		const filePath = editor.document.uri.fsPath;
		const passNum = parseInt(filePath.substring(filePath.length - 8, filePath.length - 5));
		const seqFile = new SequenceFile();
		seqFile.init();
		return seqFile.getUriByPassNumber(passNum);
	}

	parseTreeLines(editor: vscode.TextEditor) {
		const lines = this.getSelectedLines(editor);
		this.selectedLines = [];
		this.selStart = -1;
		this.selEnd = -1;
		let lineCount = 0;

		for (const line of lines) {
			lineCount++;
			const treeLine = this.parseTreeLine(line);
			if (this.selStart < 0 || treeLine.ustart < this.selStart) {
				this.selStart = treeLine.ustart;
			}
			if (this.selEnd < 0 || treeLine.uend > this.selEnd) {
				this.selEnd = treeLine.uend;
			}
			this.selectedLines.push(treeLine);
		}
	}

	findRule(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.TXXT) {
			this.setFilesNames(this.getUri().fsPath);

			if (this.parseBrackets()) {
				this.parseFireds(this.treeFile);
				const absolute = this.lineCharacterToAbsolute(editor.selection.active);

				if (absolute >= 0) {
					const firedNumber = this.findMatchByAbsolute(absolute);

					if (firedNumber >= 0) {
						const chosen = this.getFired(firedNumber);
						if (chosen.rulenum > 0) {
							const ruleFileUri = visualText.analyzer.seqFile.getUriByPassNumber(chosen.rulenum);
							visualText.colorizeAnalyzer();
							vscode.window.showTextDocument(ruleFileUri, { viewColumn: vscode.ViewColumn.Beside }).then(editor => {
								const pos = new vscode.Position(chosen.ruleline - 1, 0);
								editor.selections = [new vscode.Selection(pos, pos)];
								const range = new vscode.Range(pos, pos);
								editor.revealRange(range);
							});
						} else {
							this.searchInDictionaries(chosen.str);
						}
					}
				}
			}
			else {
				vscode.window.showInformationMessage('No fired rule found');
			}
		}
	}

	getFired(firedNumber: number): Fired {
		const chosen = this.fireds[firedNumber];
		while (chosen.rulenum == 0 && firedNumber > 0) {
			firedNumber--;
			if (firedNumber < 0)
				break;
			const parent: Fired = this.fireds[firedNumber];
			if (parent.to < chosen.from)
				break;
		}
		return chosen;
	}

	setFile(file: vscode.Uri, separateLines: boolean = true): boolean {
		if (file.fsPath.length) {
			super.setFile(file, separateLines);
			this.setFilesNames(file.fsPath);
			return true;
		}
		return false;
	}

	setFilesNames(filepath: string) {
		if (filepath.length) {
			this.basename = path.basename(filepath, '.log');
			this.basename = path.basename(this.basename, '.tree');
			this.basename = path.basename(this.basename, '.txxt');
			this.basename = path.basename(this.basename, '.txt');
			this.basename = path.basename(this.basename, '.pat');
			this.basename = path.basename(this.basename, '.nlp');
			this.treeFile = visualText.analyzer.getOutputDirectory(this.basename + '.tree').fsPath;
			this.HighlightFile = visualText.analyzer.getOutputDirectory(this.basename + '.txxt').fsPath;
			this.inputFile = visualText.analyzer.getTextPath().fsPath;
		}
	}

	findSelectedTreeStr(editor: vscode.TextEditor): boolean {
		this.setDocument(editor);
		this.selectedTreeStr = '';
		const type: nlpFileType = this.getFileType();
		if (this.getFileType() == nlpFileType.TXXT || this.getFileType() == nlpFileType.TXT) {
			if (this.getFileType() == nlpFileType.TXT) {
				this.setFilesNames(visualText.analyzer.getTreeFile().fsPath);
				this.absoluteRangeFromSelection(this.getUri().fsPath, editor.selection);
			} else {
				this.setFilesNames(this.getUri().fsPath);
				this.absoluteRangeFromSelection(this.HighlightFile, editor.selection);
			}
			this.findTreeFileLines();
		}
		return this.selectedTreeStr.length ? true : false;
	}

	generateRule(editor: vscode.TextEditor, genType: generateType) {
		if (visualText.analyzer.hasText()) {
			const ruleStr = '';
			const type = this.getFileType();
			const nlp = new NLPFile();

			if (type == nlpFileType.NLP || type == nlpFileType.UNKNOWN) {
				const range = new vscode.Range(editor.selection.start, editor.selection.end);
				const str = editor.document.getText(range);
				let ruleStr = this.generateRuleFromStr(str, genType);
				ruleStr = this.ruleStrOutput(ruleStr);
				const snippet = new vscode.SnippetString(ruleStr);
				editor.insertSnippet(snippet, range);

			} else {
				const passFilePath = visualText.analyzer.getPassPath();
				const passName = visualText.analyzer.seqFile.base(passFilePath.fsPath);
				const passItem = visualText.analyzer.seqFile.findPass('nlp', passName);
				this.treeFile = this.anaFile(passItem.passNum).fsPath;

				if (this.findSelectedTreeStr(editor)) {
					let ruleStr = this.ruleFromLines(genType);
					nlp.setStr(ruleStr);
					ruleStr = nlp.formatRule(ruleStr);
					const ruleStrFinal = this.ruleStrOutput(ruleStr);
					nlp.setFile(passFilePath);
					nlp.insertRule(ruleStrFinal);
				}
			}
		}
		else {
			vscode.window.showInformationMessage('No text selected');
		}
	}

	ruleStrOutput(ruleStr: string): string {
		return `
@RULES
_newNode <-
${ruleStr}
\t@@
		`;
	}

	ruleFromLines(genType: generateType) {
		let num = 1;
		let ruleStr = '';
		let lastend = 0;
		let indent = -1;

		for (const line of this.selectedLines) {
			if (line.node.localeCompare('_ROOT') == 0)
				continue;
			let node = line.node;
			if (indent == -1 || line.indent < indent) indent = line.indent;
			if (line.end > lastend && line.indent <= indent) {
				if (genType == generateType.GENERAL) {
					if (line.type.localeCompare('alpha') == 0 && node.charAt(0) === node.charAt(0).toUpperCase())
						node = '_xCAP';
					else if (line.type.localeCompare('alpha') == 0)
						node = '_xALPHA';
					else if (line.type.localeCompare('white') == 0)
						node = '_xWHITE';
					else if (line.type.localeCompare('num') == 0)
						node = '_xNUM';
					else if (line.type.localeCompare('punct') == 0 || node.length == 1)
						node = `\\${node}`;
				} else if (node.length == 1) {
					node = `\\${node}`;
				}
				const newRuleStr = `\t${node}\t### (${num})`;
				if (ruleStr.length)
					ruleStr += '\n';
				ruleStr += newRuleStr;
				num++;
			}
			lastend = line.end;
		}
		return ruleStr;
	}

	generateRuleFromStr(str: string, genType: generateType): string {
		let ruleStr = '';
		let node = '';
		const tokens = this.nlpppSplitter(str.toLowerCase());
		let num = 1;
		for (const token of tokens) {
			node = token;
			const isint = !isNaN(parseInt(token));
			if (genType == generateType.GENERAL) {
				if (isint) {
					node = '_xNUM';
				} else if (token == ' ') {
					node = '_xWHITE';
				} else if (token.length == 1 && !isint) {
					node = '\\' + token;
				} else {
					node = '_xALPHA';
				}
			} else if (token.length == 1 && !isint) {
				node = '\\' + token;
			}

			const nodeStr = `\t${node}\t### (${num})`;
			if (ruleStr.length)
				ruleStr += '\n';
			ruleStr += nodeStr;
			num++;
		}
		return ruleStr;
	}

	nlpppSplitter(str: string): string[] {
		const len = str.length;
		let i = 0;
		const tokens: string[] = [];
		let tok = '';
		const isDigit: boolean = false;
		enum charType { UNKNOWN, ALPHA, DIGIT, SPACE, SPECIAL }
		let type: charType = charType.UNKNOWN;
		let lastType: charType = charType.UNKNOWN;

		while (i < len) {
			const c = str[i++];
			if (c >= '0' && c <= '9') {
				type = charType.DIGIT;
			} else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
				type = charType.ALPHA;
			} else if (c == ' ') {
				type = charType.SPACE;
			} else {
				type = charType.SPECIAL;
			}
			if (type != lastType && lastType != charType.UNKNOWN && lastType != charType.SPACE) {
				tokens.push(tok);
				if (type == charType.SPACE)
					tok = '';
				else
					tok = c;
				lastType = charType.UNKNOWN;
			} else if (type != charType.SPACE) {
				tok = tok + c;
			}
			lastType = type;
		}
		if (tok.length)
			tokens.push(tok);

		return tokens;
	}

	parseTreeLine(line: string): TreeLine {
		const treeLine: TreeLine = { node: '', start: 0, end: 0, ustart: 0, uend: 0, passNum: 0, ruleLine: 0, type: '', fired: false, built: false, rest: '', indent: 0 };
		const tokens = line.split('[');
		let firstTok = 1;
		if (tokens.length > 1) {
			// Exception when the character is an open square bracket
			if (line.trim().startsWith('[')) {
				treeLine.node = '[';
				treeLine.indent = tokens[0].length;
				firstTok = 2;
			} else {
				treeLine.node = tokens[0].trim();
				treeLine.indent = tokens[0].search(/\S/) - 1;
			}
			const toks = tokens[firstTok].split(/[,\]]/);
			if (toks.length >= 4) {
				treeLine.start = +toks[0];
				treeLine.end = +toks[1];
				treeLine.ustart = +toks[2];
				treeLine.uend = +toks[3];
				treeLine.passNum = +toks[4];
				treeLine.ruleLine = +toks[5];
				treeLine.type = toks[6];
				if (toks.length > 7) {
					if (toks[7].length)
						treeLine.fired = true;
				}
				if (toks.length > 8) {
					if (toks[8].length > 0)
						treeLine.built = true;
				}
			}
		}
		return treeLine;
	}

	findSelectedTree(editor: vscode.TextEditor) {
		if (this.findSelectedTreeStr(editor)) {
			const filename = this.basename + '-' + this.selStart.toString() + '-' + this.selEnd.toString() + '.tree';
			this.openTemporaryFile(filename, this.selectedTreeStr);
		}
		else {
			vscode.window.showInformationMessage('No text selected');
		}
	}

	openTemporaryFile(filepath: string, content: string) {
		const newFile = vscode.Uri.parse('untitled:' + filepath);
		const tempDir = path.resolve(
			vscode.workspace
				.getConfiguration('createtmpfile')
				.get('tmpDir') || os.tmpdir());
		const filePath = vscode.Uri.file(path.join(tempDir, filepath));
		fs.writeFileSync(filePath.fsPath, content);
		vscode.workspace.openTextDocument(filePath).then(document => {
			visualText.colorizeAnalyzer();
			vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside });
		});
	}

	bracketCount(text: string, end: number = 0): number {
		if (end) {
			text = text.substring(0, end);
		}
		const parens = text.split(/\(\(\(/);
		const parens2 = text.split(/\)\)\)/);
		const angle = text.split(/\<\<\</);
		const angle2 = text.split(/\>\>\>/);
		const parenCount = ((parens.length - 1) + (parens2.length - 1)) * 3;
		const angleCount = ((angle.length - 1) + (angle2.length - 1)) * 3;
		return parenCount + angleCount;
	}

	getCharacterLength(str: string) {
		return str.length;
	}

	absoluteRangeFromSelection(textfile: string, selection: vscode.Selection) {
		let absStart = 0;
		let absEnd = 0;
		const file = new TextFile(textfile);
		let linecount = 0;
		let multiline = false;

		for (const line of file.getLines(true)) {
			const len = this.getCharacterLength(line);
			if (multiline) {
				if (selection.end.line == linecount) {
					absEnd += selection.end.character - this.bracketCount(line, selection.end.character) - 1;
					break;
				}
				absEnd += len + this.bracketCount(line);
				if (len == 0)
					absEnd += 1;
			}
			else if (selection.start.line == linecount) {
				const beforeStr = line.substring(0, selection.start.character);
				const bLen = this.getCharacterLength(beforeStr);
				absStart += bLen - this.bracketCount(line, selection.start.character);
				if (selection.end.line == linecount) {
					const selStr = line.substring(selection.start.character, selection.end.character);
					// let selStr = line.substring(selection.start.character,selection.end.character-selection.start.character);
					absEnd = absStart + selStr.length - this.bracketCount(selStr);
					break;
				}
				absEnd = absStart + len - selection.start.character - this.bracketCount(line);
				multiline = true;
			} else {
				const bracket = this.bracketCount(line);
				absStart += len - bracket;
				if (len == 0)
					absStart += 1;
			}
			linecount++;
		}

		this.selStart = absStart;
		this.selEnd = absEnd;
	}

	findTreeFileLines() {
		const file = new TextFile(this.treeFile);
		const sep = file.getSeparatorNormalized();
		let from = 0;
		let to = 0;
		let add = false;
		this.selectedLines = [];
		this.selectedTreeStr = '';

		for (const line of file.getLines()) {
			from = 0;
			to = 0;
			add = false;

			const tokens = line.split('[');
			if (tokens.length > 1) {
				const toks = tokens[1].split(/[,\]]/);
				if (toks.length > 4) {
					from = +toks[2];
					to = +toks[3];
					if (from >= this.selStart && to <= this.selEnd) {
						this.selectedLines.push(this.parseTreeLine(line));
						this.selectedTreeStr = this.selectedTreeStr.concat(line, sep);
					}
				}
			}
		}
	}

	findMatchByAbsolute(absolute: number): number {
		let firedNumber = 0;

		for (const Highlight of this.Highlight) {
			if (Highlight.startb <= absolute && absolute <= Highlight.endb) {
				return firedNumber;
			} else if (absolute < Highlight.endb) {
				return -1;
			}
			firedNumber++;
		}

		return -1;
	}

	lineCharacterToAbsolute(position: vscode.Position): number {
		const file = new TextFile(this.HighlightFile);
		let lineCount = 0;
		let absolute = 0;

		for (const line of file.getLines()) {
			if (lineCount == position.line) {
				return absolute + position.character;
			}
			absolute += line.length;
			lineCount++;
		}
		return -1;
	}

	parseBrackets(): number {
		this.Highlight = [];
		const squares = this.parseBracketsRegex('(');
		const curlies = this.parseBracketsRegex('<');
		this.Highlight.sort(function (a, b) { return a.start - b.start });
		return squares + curlies;
	}

	parseBracketsRegex(bracket: string): number {
		const repeatedBrackets = 3;
		const startPattern = bracket === '<' ? '\<\<\<' : '\(\(\(';
		const endPattern = bracket === '<' ? '\>\>\>' : '\)\)\)';

		const file = new TextFile(this.HighlightFile, false);
		const tokens = file.getText(true).split(startPattern);
		let tokencount = 0;
		let len = 0;
		let lenBracket = 0;

		for (let token of tokens) {
			token = token.replace(/[\n\r]/g, '');
			if (tokencount) {
				const Highlight: Highlight = { start: 0, end: 0, startb: 0, endb: 0 };
				const toks = token.split(endPattern);
				Highlight.start = len;
				Highlight.end = len + toks[0].length - 1;
				Highlight.startb = lenBracket;
				Highlight.endb = lenBracket + toks[0].length - 1;
				this.Highlight.push(Highlight);
			}

			let tok = token.replace(/\<\<\</g, '');
			tok = tok.replace(/\>\>\>/g, '');
			tok = tok.replace(/\(\(\(/g, '');
			tok = tok.replace(/\)\)\)/g, '');
			len += tok.length;
			tokencount++;
			lenBracket += token.length + repeatedBrackets;
		}
		return tokencount - 1;
	}

	parseFireds(treeFile: string) {
		const refire = /[\[,\]]/g;
		this.fireds = [];

		const file = new TextFile(treeFile);
		let lastTo = 0;

		for (let i = 0; i < file.getLines().length; i++) {
			const line = file.getLine(i);
			const tokens = line.split(',fired');
			if (tokens.length > 1) {
				const fired: Fired = { str: '', from: 0, to: 0, ufrom: 0, uto: 0, rulenum: 0, ruleline: 0, built: false };

				const tts = line.split(refire);
				const firstChar = line.trim().charAt(0);
				if (/^[\[\],]/i.test(firstChar)) {
					tts[0] = firstChar;
					tts.splice(1, 1);
				}
				fired.built = (tts.length >= 9 && tts[9] === 'blt') ? true : false;
				if (+tts[2] > lastTo) {
					fired.str = tts[0].trim();
					fired.from = +tts[1];
					fired.to = lastTo = +tts[2];
					fired.ufrom = +tts[3];
					fired.uto = +tts[4];
					fired.rulenum = +tts[5];
					fired.ruleline = +tts[6];
					if (nlpStatusBar.getFiredMode() == FiredMode.FIRED || fired.built)
						this.fireds.push(fired);

					if (fired.str.startsWith('_')) {
						const indent = line.search(/\S/);
						fired.str = '';
						while (indent > 0) {
							i++;
							const nextLine = file.getLine(i);
							const pos = nextLine.search(/\S/);
							if (pos <= indent)
								break;
							const ts = nextLine.split(/\s+/);
							const rest = ts[1].trim();
							fired.str = fired.str + ' ' + rest;
						}
						fired.str = fired.str.trim();
						i--;  // Back up one line
					}
				}
			}
		}
		return this.fireds.length ? true : false;
	}

	firedFile(pass: number, rewrite: boolean = false): vscode.Uri {
		const firefile: vscode.Uri = this.anaFile(pass, nlpFileType.TXXT);
		if (!fs.existsSync(firefile.fsPath) || rewrite) {
			const treeFile = this.anaFile(pass);
			if (fs.existsSync(treeFile.fsPath)) {
				this.parseFireds(treeFile.fsPath);
				this.writeFiredText(treeFile, rewrite);
			}
		}
		return firefile;
	}

	fileCreateTime(filepath: string): Date {
		if (fs.existsSync(filepath)) {
			const stats = fs.statSync(filepath);
			if (stats)
				return stats.ctime;
		}
		return new Date(1970, 1, 1);
	}

	writeFiredText(treeFile: vscode.Uri, rewrite: boolean = false): vscode.Uri {
		this.setFilesNames(treeFile.fsPath);
		const logDate: Date = this.fileCreateTime(treeFile.fsPath);
		const inputDate: Date = this.fileCreateTime(this.inputFile);
		if (!rewrite && inputDate < logDate && fs.existsSync(this.HighlightFile))
			return vscode.Uri.file(this.HighlightFile);
		else if (!rewrite && !fs.existsSync(this.inputFile))
			return treeFile;

		const file = new TextFile(this.inputFile, false);

		let textfire = '';
		let lastTo = 0;
		const between = '';
		const Highlight = '';
		let from = 0;
		let to = 0;
		let built = false;
		const byteText = new TextEncoder().encode(file.getText(true));

		if (this.fireds.length) {
			for (let i = 0; i < this.fireds.length; i++) {
				from = this.fireds[i].from;
				to = this.fireds[i].to;
				built = this.fireds[i].built;

				const hl = byteText.slice(from, to + 1);
				const Highlight = new TextDecoder().decode(hl);

				const bt = byteText.slice(lastTo, from);
				const between = new TextDecoder().decode(bt);

				if (built)
					textfire = textfire.concat(between, '<<<', Highlight, '>>>');
				else if (nlpStatusBar.getFiredMode() == FiredMode.FIRED)
					textfire = textfire.concat(between, '(((', Highlight, ')))');
				else
					textfire = textfire.concat(between, Highlight);

				lastTo = to + 1;
			}
			const tx = byteText.slice(lastTo, byteText.length);
			const rest = new TextDecoder().decode(tx);
			textfire = textfire.concat(rest);
		} else {
			textfire = file.getText(true);
		}

		fs.writeFileSync(this.HighlightFile, file.unnormalizeText(textfire));
		this.fireds = [];
		return vscode.Uri.file(this.HighlightFile);
	}

	updateTxxtFiles(fileType: nlpFileType) {
		const exts = new Array('.' + this.getExtension(fileType));
		const files = dirfuncs.getFiles(visualText.analyzer.getOutputDirectory(), exts);
		for (const file of files) {
			const numStr = path.basename(file.fsPath).substring(3, 3);
			const passNum = Number.parseInt(numStr);
			this.firedFile(passNum, true);
		}
	}
}
