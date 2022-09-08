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

export interface LogLine {
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

export let logFile: LogFile;
export class LogFile extends TextFile {
	
	private fireds: Fired[] = [];
	private highlights: Highlight[] = [];
	private selectedTreeStr = '';
	private selStart = -1;
	private selEnd = -1;
	private logFile = '';
	private highlightFile = '';
	private inputFile = '';
	private selectedLines: LogLine[] = [];

	constructor() {
		super();
	}

	ruleFired(editor: vscode.TextEditor) {
		if (visualText.analyzer.hasText()) {
			this.setFile(editor.document.uri);
			this.parseLogLines(editor);
			if (this.selStart >= 0) {
				var seqFile = new SequenceFile();
				seqFile.init();
				var passNum = this.selectedLines[0].passNum;
				if (passNum) {
					var passFile = seqFile.getUriByPassNumber(passNum);
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

	hightlightText(editor: vscode.TextEditor) {
		if (visualText.analyzer.hasText()) {
			this.setFile(editor.document.uri);
			this.parseLogLines(editor);
			if (this.selStart >= 0) {
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
				this.parseLogLines(editor);
	
				if (this.selStart >= 0) {
					let pathStr = '';
					let logLine = this.selectedLines[0];
	
					if (logLine) {
						let start = this.getStartLine();
						let lastIndent = logLine.indent + 1;
						while ( logLine.indent > 0) {
							let line = this.getLines()[start--];
							logLine = this.parseLogLine(line);
							if (logLine.indent < lastIndent) {
								pathStr = logLine.node + ' ' + pathStr;
								lastIndent = logLine.indent;
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

	getPassFromPath(editor: vscode.TextEditor): vscode.Uri {
		let filePath = editor.document.uri.fsPath;
		let passNum = parseInt(filePath.substring(filePath.length-8,filePath.length-5));
		var seqFile = new SequenceFile();
		seqFile.init();
		return seqFile.getUriByPassNumber(passNum);
	}

	parseLogLines(editor: vscode.TextEditor) {
		let lines = this.getSelectedLines(editor);
		this.selectedLines = [];
		this.selStart = -1;
		this.selEnd = -1;

		for (let line of lines) {
			let logLine = this.parseLogLine(line);
			if (this.selStart < 0 || logLine.ustart < this.selStart)
				this.selStart = logLine.ustart;
			if (this.selEnd < 0 || logLine.uend > this.selEnd)
				this.selEnd = logLine.uend;
			this.selectedLines.push(logLine);
		}
	}

    findRule(editor: vscode.TextEditor) {
		this.setDocument(editor);
		if (this.getFileType() == nlpFileType.TXXT) {
			this.setFilesNames(this.getUri().fsPath);

			if (this.parseBrackets()) {
				this.parseFireds(this.logFile);
				var absolute = this.lineCharacterToAbsolute(editor.selection.active);

				if (absolute >= 0) {
					var firedNumber = this.findMatchByAbsolute(absolute);

					if (firedNumber >= 0) {
						var chosen = this.getFired(firedNumber);
						if (chosen.rulenum > 0) {
							var ruleFileUri = visualText.analyzer.seqFile.getUriByPassNumber(chosen.rulenum);

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
			this.logFile = path.join(visualText.analyzer.getOutputDirectory().fsPath,this.basename+'.tree');
			this.highlightFile = path.join(visualText.analyzer.getOutputDirectory().fsPath,this.basename+'.txxt');
			this.inputFile = visualText.analyzer.getTextPath().fsPath;
		}
	}

	hasLogFileType(uri: vscode.Uri, pass: number, type: nlpFileType = nlpFileType.TREE): boolean {
		var anaFile = this.anaFile(pass,type);
		if (type == nlpFileType.TREE) {
			this.setFile(anaFile,true);
			if (this.numberOfLines() > 6)
				return true;
			return false;
		}
		return fs.existsSync(anaFile.fsPath);
	}

	anaFile(pass: number, type: nlpFileType = nlpFileType.TREE): vscode.Uri {
		var filename: string = 'ana';
		if (pass > 0) {
			if (pass < 10)
				filename = filename + '00';
			else if (pass < 100)
				filename = filename + '0';
			filename = filename + pass.toString() + '.' + this.getExtension(type);
		} else {
			filename = 'final.tree';
		}
		return vscode.Uri.file(path.join(visualText.analyzer.getOutputDirectory().fsPath,filename));
	}
	
	findSelectedTreeStr(editor: vscode.TextEditor): boolean {
		this.setDocument(editor);
		this.selectedTreeStr = '';
		if (this.getFileType() == nlpFileType.TXXT || this.getFileType() == nlpFileType.TXT) {

			if (this.getFileType() == nlpFileType.TXT) {
				this.setFilesNames(visualText.analyzer.getAnaLogFile().fsPath);
				this.absoluteRangeFromSelection(this.getUri().fsPath, editor.selection);	
			} else {
				this.setFilesNames(this.getUri().fsPath);
				this.absoluteRangeFromSelection(this.highlightFile, editor.selection);	
			}
			this.findLogfileLines();
		}
		return this.selectedTreeStr.length ? true : false;
	}

	generateRule(editor: vscode.TextEditor, genType: generateType) {
		if (visualText.analyzer.hasText()) {
			let passFilePath = visualText.analyzer.getPassPath();
			let passName = visualText.analyzer.seqFile.base(passFilePath.fsPath);
			let passItem = visualText.analyzer.seqFile.findPass('nlp',passName);
			this.logFile = this.anaFile(passItem.passNum).fsPath;

			if (this.findSelectedTreeStr(editor)) {
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
							else if (line.type.localeCompare('punct') == 0)
								node = `\\${node}`;
						}
						let newRuleStr = `\t${node}\t### (${num})`;
						ruleStr = ruleStr + '\n' + newRuleStr;
						num++;						
					}
					lastend = line.end;
				}

				let nlp = new NLPFile();
				nlp.setStr(ruleStr);
				ruleStr = nlp.formatRule(ruleStr);

				let ruleStrFinal = `
				
@RULES
_newNode <-
${ruleStr}
\t@@
`;
				nlp.setFile(passFilePath);
				nlp.insertRule(ruleStrFinal);
			}
			else {
				vscode.window.showInformationMessage('No text selected');
			}
		}
	}

	parseLogLine(line: string): LogLine {
		let logLine: LogLine = {node: '', start: 0, end: 0, ustart: 0, uend: 0, passNum: 0, ruleLine: 0, type: '', fired: false, built: false, rest: '', indent: 0};
		var tokens = line.split('[');
		let firstTok = 1;
		if (tokens.length > 1) {
			// Exception when the character is an open square bracket
			if (line.trim().startsWith('[')) {
				logLine.node = '[';
				logLine.indent = tokens[0].length;
				firstTok = 2;
			} else {
				logLine.node = tokens[0].trim();
				logLine.indent = tokens[0].search(/\S/) - 1;
			}
			var toks = tokens[firstTok].split(/[,\]]/);
			if (toks.length >= 4) {
				logLine.start = +toks[0];
				logLine.end = +toks[1];
				logLine.ustart = +toks[2];
				logLine.uend = +toks[3];	
				logLine.passNum = +toks[4];
				logLine.ruleLine = +toks[5];	
				logLine.type = toks[6];
				if (toks.length > 7 ) {
					if (toks[7].length)
						logLine.fired = true;
				}
				if (toks.length > 8) {
					if (toks[8].length > 0)
						logLine.built = true;
				}
			}
		}
		return logLine;
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

	findLogfileLines() {
		var file = new TextFile(this.logFile);
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
						this.selectedLines.push(this.parseLogLine(line));
						this.selectedTreeStr = this.selectedTreeStr.concat(line,sep);
					}		
				}
			}
		}
	}

	findMatchByAbsolute(absolute: number): number {
		var firedNumber = 0;

		for (let highlight of this.highlights) {
			if (highlight.startb <= absolute && absolute <= highlight.endb) {
				return firedNumber;
			}
			firedNumber++;
		}

		return -1;
	}

	lineCharacterToAbsolute(position: vscode.Position): number {
		var file = new TextFile(this.highlightFile);
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
		this.highlights = [];
		var squares = this.parseBracketsRegex('(');
		var curlies = this.parseBracketsRegex('<');
		this.highlights.sort(function(a,b){return a.start - b.start});
		return squares + curlies;
	}

	parseBracketsRegex(bracket: string): number {
		var startPattern = bracket === '(' ? '\<\<' : '\(\(';
		var endPattern = bracket === '<' ? '\>\>' : '\(\(';

		var file = new TextFile(this.highlightFile,false);
		var tokens = file.getText(true).split(startPattern);
		var tokencount = 0;
		var len = 0;
		var lenBracket = 0;

		for (let token of tokens) {
			token = token.replace(/[\n\r]/g, '');
			if (tokencount) {
				let highlight: Highlight = {start: 0, end: 0, startb: 0, endb: 0};
				var toks = token.split(endPattern);
				highlight.start = len;
				highlight.end = len + toks[0].length - 1;
				highlight.startb = lenBracket;
				highlight.endb = lenBracket + toks[0].length - 1;
				this.highlights.push(highlight);
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
	
	parseFireds(logfile: string) {
		var refire = /[\[,\]]/g;
		this.fireds = [];

		var file = new TextFile(logfile);
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
			var logfile = this.anaFile(pass);
			if (fs.existsSync(logfile.fsPath)) {
				this.parseFireds(logfile.fsPath);
				this.writeFiredText(logfile,rewrite);
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

	writeFiredText(logfile: vscode.Uri, rewrite: boolean=false): vscode.Uri {
		this.setFilesNames(logfile.fsPath);
		var logDate: Date = this.fileCreateTime(logfile.fsPath);
		var inputDate: Date = this.fileCreateTime(this.inputFile);
		if (!rewrite && inputDate < logDate && fs.existsSync(this.highlightFile))
			return vscode.Uri.file(this.highlightFile);
		else if (!rewrite && !fs.existsSync(this.inputFile))
			return logfile;

		var file = new TextFile(this.inputFile,false);

		var textfire = '';
		var lastTo = 0;
		var between = '';
		var highlight = '';
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
				var highlight = new TextDecoder().decode(hl);

				var bt = byteText.slice(lastTo,from);
				var between = new TextDecoder().decode(bt);

				if (built)
					textfire = textfire.concat(between,'<<',highlight,'>>');
				else if (nlpStatusBar.getFiredMode() == FiredMode.FIRED)
					textfire = textfire.concat(between,'((',highlight,'))');
				else
					textfire = textfire.concat(between,highlight);

				lastTo = to + 1;
			}
			var tx = byteText.slice(lastTo,byteText.length);
			var rest = new TextDecoder().decode(tx);
			textfire = textfire.concat(rest);
		} else {
			textfire = file.getText(true);
		}

		fs.writeFileSync(this.highlightFile,file.unnormalizeText(textfire));
		this.fireds = [];
		return vscode.Uri.file(this.highlightFile);
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

	deleteLogs(fileType: nlpFileType) {
		var exts = new Array('.'+this.getExtension(fileType));
		dirfuncs.deleteFiles(visualText.analyzer.getOutputDirectory(),exts);
	}
}