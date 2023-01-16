import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { TextFile, nlpFileType } from './textFile';
import { NLPFile } from './nlp';
import { nlpStatusBar, FiredMode } from './status';
import { SequenceFile } from './sequence';
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

	constructor() {
		super();
	}

	ruleFired(editor: vscode.TextEditor) {
		if (visualText.analyzer.hasText()) {
			this.setFile(editor.document.uri);
			this.parseTreeLines(editor);
			if (this.selStart >= 0) {
				var seqFile = new SequenceFile();
				seqFile.init();
				var passNum = this.selectedLines[0].passNum;
				if (passNum) {
					var passFile = seqFile.getUriByPassNumber(passNum);
					visualText.colorizeAnalyzer();
					vscode.window.showTextDocument(passFile).then(edit => 
						{
							var pos = new vscode.Position(this.selectedLines[0].ruleLine-1,0);
							var range = new vscode.Range(pos,pos);
							edit.selections = [new vscode.Selection(pos,pos)]; 
							edit.revealRange(range);
						});
				}
			}
		}
	}

	highlightText(editor: vscode.TextEditor) {
		if (visualText.analyzer.hasText()) {
			this.setFile(editor.document.uri);
			this.parseTreeLines(editor);
			if (this.selStart >= 0) {
				visualText.colorizeAnalyzer();
				vscode.window.showTextDocument(visualText.analyzer.getTextPath()).then(edit => 
					{
						var txt = new TextFile(visualText.analyzer.getTextPath().fsPath);
						var posStart = txt.positionAt(this.selStart-1);
						var posEnd = txt.positionAt(this.selEnd);
						var range = new vscode.Range(posStart,posEnd);
						edit.selections = [new vscode.Selection(posStart,posEnd)]; 
						edit.revealRange(range);
					});
			}				
		}
	}

	generatePath(editor: vscode.TextEditor) {
		if (visualText.analyzer.hasText()) {
			let passFileUri = this.getPassFromPath(editor);
			if (passFileUri.fsPath.length > 2) {
				this.setFile(editor.document.uri);
				this.parseTreeLines(editor);
	
				if (this.selStart >= 0) {
					let pathStr = '';
					let treeLine = this.selectedLines[0];
	
					if (treeLine) {
						let start = this.getStartLine();
						let lastIndent = treeLine.indent + 1;
						while ( treeLine.indent > 0) {
							let line = this.getLines()[start--];
							treeLine = this.parseTreeLine(line);
							if (treeLine.indent < lastIndent) {
								pathStr = treeLine.node + ' ' + pathStr;
								lastIndent = treeLine.indent;
							}
						}
					}
					pathStr = '@PATH ' + pathStr.trim();
	
					let nlp = new NLPFile();
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
		let filePath = editor.document.uri.fsPath;
		let passNum = parseInt(filePath.substring(filePath.length-8,filePath.length-5));
		var seqFile = new SequenceFile();
		seqFile.init();
		return seqFile.getUriByPassNumber(passNum);
	}

	parseTreeLines(editor: vscode.TextEditor) {
		let lines = this.getSelectedLines(editor);
		this.selectedLines = [];
		this.selStart = -1;
		this.selEnd = -1;

		for (let line of lines) {
			let treeLine = this.parseTreeLine(line);
			if (this.selStart < 0 || treeLine.ustart < this.selStart)
				this.selStart = treeLine.ustart;
			if (this.selEnd < 0 || treeLine.uend > this.selEnd)
				this.selEnd = treeLine.uend;
			this.selectedLines.push(treeLine);
		}
	}

    findRule(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.TXXT) {
			this.setFilesNames(this.getUri().fsPath);

			if (this.parseBrackets()) {
				this.parseFireds(this.treeFile);
				var absolute = this.lineCharacterToAbsolute(editor.selection.active);

				if (absolute >= 0) {
					var firedNumber = this.findMatchByAbsolute(absolute);

					if (firedNumber >= 0) {
						var chosen = this.getFired(firedNumber);
						if (chosen.rulenum > 0) {
							var ruleFileUri = visualText.analyzer.seqFile.getUriByPassNumber(chosen.rulenum);
							visualText.colorizeAnalyzer();
							vscode.window.showTextDocument(ruleFileUri).then(editor => 
							{
								var pos = new vscode.Position(chosen.ruleline-1,0);
								editor.selections = [new vscode.Selection(pos,pos)]; 
								var range = new vscode.Range(pos, pos);
								editor.revealRange(range);
							});							
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
		var chosen = this.fireds[firedNumber];
		while (chosen.rulenum == 0) {
			firedNumber--;
			if (firedNumber < 0)
				break;
			let parent: Fired = this.fireds[firedNumber];
			if (parent.to < chosen.from)
				break;
		}
		return chosen;
	}

	setFile(file: vscode.Uri, separateLines: boolean = true): boolean {
		if (file.fsPath.length) {
			super.setFile(file,separateLines);
			this.setFilesNames(file.fsPath);
			return true;	
		}
		return false;
	}
	
	setFilesNames(filepath: string) {
		if (filepath.length) {
			this.basename = path.basename(filepath,'.log');
			this.basename = path.basename(this.basename,'.tree');
			this.basename = path.basename(this.basename,'.txxt');
			this.basename = path.basename(this.basename,'.txt');
			this.basename = path.basename(this.basename,'.pat');
			this.basename = path.basename(this.basename,'.nlp');
			this.treeFile = path.join(visualText.analyzer.getOutputDirectory().fsPath,this.basename+'.tree');
			this.HighlightFile = path.join(visualText.analyzer.getOutputDirectory().fsPath,this.basename+'.txxt');
			this.inputFile = visualText.analyzer.getTextPath().fsPath;
		}
	}

	findSelectedTreeStr(editor: vscode.TextEditor): boolean {
		this.setDocument(editor);
		this.selectedTreeStr = '';
		let type: nlpFileType = this.getFileType();
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
			let ruleStr = '';
			let type = this.getFileType();
			let nlp = new NLPFile();

			if (type == nlpFileType.NLP || type == nlpFileType.UNKNOWN) {
				var range = new vscode.Range(editor.selection.start, editor.selection.end);
				let str = editor.document.getText(range);
				let ruleStr = this.generateRuleFromStr(str, genType);
				ruleStr = this.ruleStrOutput(ruleStr);
				var snippet = new vscode.SnippetString(ruleStr);
				editor.insertSnippet(snippet,range);

			} else {
				let passFilePath = visualText.analyzer.getPassPath();
				let passName = visualText.analyzer.seqFile.base(passFilePath.fsPath);
				let passItem = visualText.analyzer.seqFile.findPass('nlp',passName);
				this.treeFile = this.anaFile(passItem.passNum).fsPath;
	
				if (this.findSelectedTreeStr(editor)) {
					let ruleStr = this.ruleFromLines(genType);
					nlp.setStr(ruleStr);
					ruleStr = nlp.formatRule(ruleStr);
					let ruleStrFinal = this.ruleStrOutput(ruleStr);
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

		for (let line of this.selectedLines) {
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
				let newRuleStr = `\t${node}\t### (${num})`;
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
		var tokens = this.nlpppSplitter(str.toLowerCase());
		let num = 1;
		for (let token of tokens) {
			node = token;
			let isint = !isNaN(parseInt(token));
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

			let nodeStr = `\t${node}\t### (${num})`;
			if (ruleStr.length)
				ruleStr += '\n';
			ruleStr += nodeStr;
			num++;
		}
		return ruleStr;
	}

	nlpppSplitter(str: string): string[] {
		let len = str.length;
		let i = 0;
		let tokens: string[] = [];
		let tok = '';
		let isDigit: boolean = false;
		enum charType { UNKNOWN, ALPHA, DIGIT, SPACE, SPECIAL }
		let type: charType = charType.UNKNOWN;
		let lastType: charType = charType.UNKNOWN;

		while (i < len) {
			let c = str[i++];
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
		let treeLine: TreeLine = {node: '', start: 0, end: 0, ustart: 0, uend: 0, passNum: 0, ruleLine: 0, type: '', fired: false, built: false, rest: '', indent: 0};
		var tokens = line.split('[');
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
			var toks = tokens[firstTok].split(/[,\]]/);
			if (toks.length >= 4) {
				treeLine.start = +toks[0];
				treeLine.end = +toks[1];
				treeLine.ustart = +toks[2];
				treeLine.uend = +toks[3];	
				treeLine.passNum = +toks[4];
				treeLine.ruleLine = +toks[5];	
				treeLine.type = toks[6];
				if (toks.length > 7 ) {
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
			var filename = this.basename + '-' + this.selStart.toString() + '-' + this.selEnd.toString() + '.tree';
			this.openTemporaryFile(filename,this.selectedTreeStr);
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
		var filePath = vscode.Uri.file(path.join(tempDir,filepath));
		fs.writeFileSync(filePath.fsPath, content);
		vscode.workspace.openTextDocument(filePath).then(document => {
			visualText.colorizeAnalyzer();
			vscode.window.showTextDocument(document);
		});
	}

	bracketCount(text: string, end: number = 0): number {
		if (end) {
			text = text.substring(0,end);
		}
		var parens = text.split(/\(\(/);
		var parens2 = text.split(/\)\)/);
		var angle = text.split(/\<\</);
		var angle2 = text.split(/\>\>/);
		var parenCount = ((parens.length + parens2.length - 2))*2;
		var angleCount = ((angle.length + angle2.length - 2))*2;
		return parenCount + angleCount;
	}

	getCharacterLength(str: string) {
		return [...str].length;
	}

	absoluteRangeFromSelection(textfile: string, selection: vscode.Selection) {
		var absStart = 0;
		var absEnd = 0;
		var file = new TextFile(textfile);
		var linecount = 0;
		var multiline = false;

		for (let line of file.getLines(true)) {
			var len = this.getCharacterLength(line);
			if (multiline) {
				if (selection.end.line == linecount) {
					absEnd += selection.end.character - this.bracketCount(line,selection.end.character) - 1;
					break;
				}
				absEnd += len + this.bracketCount(line);
				if (len == 0)
					absEnd += 1;
			}
			else if (selection.start.line == linecount) {
				var beforeStr = line.substring(0,selection.start.character);
				var bLen = this.getCharacterLength(beforeStr);
				absStart += bLen - this.bracketCount(line,selection.start.character);
				if (selection.end.line == linecount) {
					var selStr = line.substring(selection.start.character,selection.end.character-selection.start.character);
					absEnd = absStart + selStr.length - this.bracketCount(selStr) - 1;
					break;
				}
				absEnd = absStart + len - selection.start.character - this.bracketCount(line);
				multiline = true;
			} else {
				absStart += len - this.bracketCount(line);
				if (len == 0)
					absStart += 1;
			}
			linecount++;
		}

		this.selStart = absStart;
		this.selEnd = absEnd;
	}

	findTreeFileLines() {
		var file = new TextFile(this.treeFile);
		var sep = file.getSeparatorNormalized();
		var from = 0;
		var to = 0;
		var add = false;
		this.selectedLines = [];
		this.selectedTreeStr = '';

		for (let line of file.getLines()) {
			from = 0;
			to = 0;
			add = false;

			var tokens = line.split('[');
			if (tokens.length > 1) {
				var toks = tokens[1].split(/[,\]]/);
				if (toks.length > 4) {
					from = +toks[2];
					to = +toks[3];
					if (from >= this.selStart && to <= this.selEnd) {
						this.selectedLines.push(this.parseTreeLine(line));
						this.selectedTreeStr = this.selectedTreeStr.concat(line,sep);
					}		
				}
			}
		}
	}

	findMatchByAbsolute(absolute: number): number {
		var firedNumber = 0;

		for (let Highlight of this.Highlight) {
			if (Highlight.startb <= absolute && absolute <= Highlight.endb) {
				return firedNumber;
			}
			firedNumber++;
		}

		return -1;
	}

	lineCharacterToAbsolute(position: vscode.Position): number {
		var file = new TextFile(this.HighlightFile);
		var lineCount = 0;
		var absolute = 0;

		for (let line of file.getLines()) {
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
		var squares = this.parseBracketsRegex('(');
		var curlies = this.parseBracketsRegex('<');
		this.Highlight.sort(function(a,b){return a.start - b.start});
		return squares + curlies;
	}

	parseBracketsRegex(bracket: string): number {
		var startPattern = bracket === '(' ? '\<\<' : '\(\(';
		var endPattern = bracket === '<' ? '\>\>' : '\(\(';

		var file = new TextFile(this.HighlightFile,false);
		var tokens = file.getText(true).split(startPattern);
		var tokencount = 0;
		var len = 0;
		var lenBracket = 0;

		for (let token of tokens) {
			token = token.replace(/[\n\r]/g, '');
			if (tokencount) {
				let Highlight: Highlight = {start: 0, end: 0, startb: 0, endb: 0};
				var toks = token.split(endPattern);
				Highlight.start = len;
				Highlight.end = len + toks[0].length - 1;
				Highlight.startb = lenBracket;
				Highlight.endb = lenBracket + toks[0].length - 1;
				this.Highlight.push(Highlight);
			}

			let tok = token.replace(/\<\</g, '');
			tok = tok.replace(/\>\>/g, '');
			tok = tok.replace(/\(\(/g, '');
			tok = tok.replace(/\)\)/g, '');
			len += tok.length;
			tokencount++;
			lenBracket += token.length + 2;
		}
		return tokencount - 1;
	}
	
	parseFireds(treeFile: string) {
		var refire = /[\[,\]]/g;
		this.fireds = [];

		var file = new TextFile(treeFile);
		var lastTo = 0;

		for (let line of file.getLines()) {
			var tokens = line.split(',fired');
			if (tokens.length > 1) {
				let fired: Fired = {from: 0, to: 0, ufrom: 0, uto: 0, rulenum: 0, ruleline: 0, built: false};
				var tts = line.split(refire);
				fired.built = (tts.length >= 9 && tts[9] === 'blt') ? true : false;
				if (+tts[2] > lastTo) {
					fired.from = +tts[1];
					fired.to = lastTo = +tts[2];
					fired.ufrom = +tts[3];
					fired.uto = lastTo = +tts[4];
					fired.rulenum = +tts[5];
					fired.ruleline = +tts[6];
					if (nlpStatusBar.getFiredMode() == FiredMode.FIRED || fired.built)
						this.fireds.push(fired);						
				}
			}
		}
		return this.fireds.length ? true : false;
	}

	firedFile(pass: number, rewrite: boolean=false): vscode.Uri {
		var firefile: vscode.Uri = this.anaFile(pass,nlpFileType.TXXT);
		if (!fs.existsSync(firefile.fsPath) || rewrite) {
			var treeFile = this.anaFile(pass);
			if (fs.existsSync(treeFile.fsPath)) {
				this.parseFireds(treeFile.fsPath);
				this.writeFiredText(treeFile,rewrite);
			}
		}
		return firefile;
    }
    
	fileCreateTime(filepath: string): Date {
		if (fs.existsSync(filepath)) {
			var stats = fs.statSync(filepath);
			if (stats)
				return stats.ctime;
		}
		return new Date(1970, 1, 1);
	}

	writeFiredText(treeFile: vscode.Uri, rewrite: boolean=false): vscode.Uri {
		this.setFilesNames(treeFile.fsPath);
		var logDate: Date = this.fileCreateTime(treeFile.fsPath);
		var inputDate: Date = this.fileCreateTime(this.inputFile);
		if (!rewrite && inputDate < logDate && fs.existsSync(this.HighlightFile))
			return vscode.Uri.file(this.HighlightFile);
		else if (!rewrite && !fs.existsSync(this.inputFile))
			return treeFile;

		var file = new TextFile(this.inputFile,false);

		var textfire = '';
		var lastTo = 0;
		var between = '';
		var Highlight = '';
		var from = 0;
		var to = 0;
		var built = false;
		var byteText = new TextEncoder().encode(file.getText(true));

		if (this.fireds.length) {
			for (var i = 0; i < this.fireds.length; i++) {
				from = this.fireds[i].from;
				to = this.fireds[i].to;
				built = this.fireds[i].built;

				var hl = byteText.slice(from,to+1);
				var Highlight = new TextDecoder().decode(hl);

				var bt = byteText.slice(lastTo,from);
				var between = new TextDecoder().decode(bt);

				if (built)
					textfire = textfire.concat(between,'<<',Highlight,'>>');
				else if (nlpStatusBar.getFiredMode() == FiredMode.FIRED)
					textfire = textfire.concat(between,'((',Highlight,'))');
				else
					textfire = textfire.concat(between,Highlight);

				lastTo = to + 1;
			}
			var tx = byteText.slice(lastTo,byteText.length);
			var rest = new TextDecoder().decode(tx);
			textfire = textfire.concat(rest);
		} else {
			textfire = file.getText(true);
		}

		fs.writeFileSync(this.HighlightFile,file.unnormalizeText(textfire));
		this.fireds = [];
		return vscode.Uri.file(this.HighlightFile);
	}

	updateTxxtFiles(fileType: nlpFileType) {
		var exts = new Array('.'+this.getExtension(fileType));
		var files = dirfuncs.getFiles(visualText.analyzer.getOutputDirectory(),exts);
		for (let file of files) {
			var numStr = path.basename(file.fsPath).substring(3,3);
			var passNum = Number.parseInt(numStr);
			this.firedFile(passNum,true);
		}
	}
}