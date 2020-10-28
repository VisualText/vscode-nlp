import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { isAbsolute } from 'path';
import { SequenceFile, moveDirection } from './sequence';
import { TextFile, nlpFileType, separatorType } from './textFile';

export let logFile: LogFile;
export class LogFile {
	
	private seqFile = new SequenceFile();
	private textFile = new TextFile();
	private workspacefolder: vscode.WorkspaceFolder | undefined;
	private basename = '';
	private inputFile = '';
    private highlightFile = '';
	private outfolder = '';
	private logfile = '';
	private fireds = new Array();
	private highlights = new Array();
	private selStart = 0;
	private selEnd = 0;

	constructor() {
		this.setOutputFolder(path.join(this.seqFile.GetWorkingDirectory().path,'output'));
	}

	anaFile(pass: number, type: nlpFileType = nlpFileType.LOG): vscode.Uri {
		var filename: string = 'ana';
		if (pass < 10)
			filename = filename + '00';
		else
			filename = filename + '0';
		filename = filename + pass.toString() + '.' + this.textFile.getExtension(type);
		return vscode.Uri.file(path.join(this.outfolder,filename));
	}
	
    findRule(editor: vscode.TextEditor) {
		this.textFile.setDocument(editor);
		if (this.textFile.getFileType() == nlpFileType.TXXT) {
			this.setFilesNames(this.textFile.getUri());

			if (this.parseBrackets()) {
				this.parseFireds(this.logfile);
				var absolute = this.lineCharacterToAbsolute(editor.selection.active);

				if (absolute >= 0) {
					var firedNumber = this.findMatchByAbsolute(absolute);

					if (firedNumber >= 0) {
						var chosen = this.fireds[firedNumber];
						var ruleFile = this.seqFile.GetFileByNumber(chosen.rule-1);
						var ruleFileUri = vscode.Uri.file(ruleFile);

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
	}

    reformatRule(editor: vscode.TextEditor) {
		this.textFile.setDocument(editor);
		if (this.textFile.getFileType() == nlpFileType.NLP) {
			this.setFilesNames(this.textFile.getUri());

			var rulevars = this.findRuleText(editor);

			if (rulevars[0].length) {
				var formattedRule = this.formatRule(rulevars[0]);
				var rang = new vscode.Selection(rulevars[1].start,rulevars[1].end);
				if (rulevars[1].start.line == rulevars[1].end.line) {
					formattedRule = this.textFile.getSeparator() + formattedRule + this.textFile.getSeparator() + '\t';
				}
				var snippet = new vscode.SnippetString(formattedRule);
				editor.insertSnippet(snippet,rang);
			}			
		}
	}

	findRuleText(editor: vscode.TextEditor): [string, vscode.Range] {
		var rulestr = '';
		var position = editor.selection.active;
		var lineStart = position.line;
		var charStart = position.character;
		var lineEnd = position.line;
		var charEnd = position.character;

		var lines = this.textFile.getLines(true);
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

		var formattedRule = ruleStr.replace(this.textFile.getSeparatorNormalized(),' ');

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

		formattedRule = rulelinesFinal.join(this.textFile.getSeparator());

		return formattedRule;
	}

	findSelectedTree(editor: vscode.TextEditor) {
		this.textFile.setDocument(editor);
		if (this.textFile.getFileType() == nlpFileType.TXXT) {
			this.setFilesNames(this.textFile.getUri());

			this.absoluteRangeFromSelection(this.highlightFile, editor.selection);	
			var treeseg = this.findLogfileLines();
			var filename = this.basename + '-' + this.selStart.toString() + '-' + this.selEnd.toString() + '.log';
			this.openNewFile(filename,treeseg);
		}
	}

	openNewFile(filepath: string, content: string) {
		const newFile = vscode.Uri.parse('untitled:' + filepath);
			vscode.workspace.openTextDocument(newFile).then(document => {
				const edit = new vscode.WorkspaceEdit();
				edit.insert(newFile, new vscode.Position(0, 0), content);
				return vscode.workspace.applyEdit(edit).then(success => {
					if (success) {
						vscode.window.showTextDocument(document);
					} else {
						vscode.window.showInformationMessage('Error!');
					}
				});
			});
	}

	bracketCount(text: string, end: number = 0): number {
		if (end) {
			text = text.substr(0,end);
		}
		var brackets = text.split(/\[\[/);
		var brackets2 = text.split(/\]\]/);
		return ((brackets.length + brackets2.length - 2))*2;
	}

	absoluteRangeFromSelection(textfile: string, selection: vscode.Selection) {
		var absStart = 0;
		var absEnd = 0;
		var file = new TextFile(textfile);
		var sep = file.getSeparator();
		var sepLength = file.getSeparatorLength();

		var linecount = 0;
		var multiline = false;

		for (let line of file.getLines(true)) {
			if (multiline) {
				if (selection.end.line == linecount) {
					absEnd += selection.end.character - this.bracketCount(line,selection.end.character);
					break;
				}
				absEnd += line.length + this.bracketCount(line);
				if (line.length == 0)
					absEnd += 1;
			}
			else if (selection.start.line == linecount) {
				absStart += selection.start.character - this.bracketCount(line,selection.start.character);
				if (selection.end.line == linecount) {
					absEnd = absStart + selection.end.character - selection.start.character - this.bracketCount(line,selection.end.character) - 1;
					break;
				}
				absEnd = absStart + line.length - this.bracketCount(line);
				multiline = true;
			} else {
				absStart += line.length - this.bracketCount(line);
				if (line.length == 0)
					absStart += 1;
			}
			linecount++;
		}

		this.selStart = absStart;
		this.selEnd = absEnd;
	}

	findLogfileLines(): string {
		var file = new TextFile(this.logfile);
		var sep = file.getSeparatorNormalized();
		var linecount = 0;
		var treeseg = '';
		var from = 0;
		var to = 0;
		var add = false;

		for (let line of file.getLines()) {
			from = 0;
			to = 0;
			add = false;

			var tokens = line.split('[');
			if (tokens.length > 1) {
				var toks = tokens[1].split(/[,\]]/);
				if (toks.length > 2) {
					from = +toks[0];
					to = +toks[1];
					if (from >= this.selStart && to <= this.selEnd) {
						treeseg = treeseg.concat(line,sep);
					}		
				}
			}
		}

		return treeseg;
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

    getOutputFolder() {
        return this.outfolder;
    }

    setOutputFolder(folderpath: string) {
        this.outfolder = folderpath;
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
		var bracketNumber = -1;
		this.highlights = [];

		var file = new TextFile(this.highlightFile,false);
		var tokens = file.getText(true).split(/\[\[/);
		var tokencount = 0;
		var len = 0;
		var lenBracket = 0;
		var start = 0;
		var end = 0;
		var startBracket = 0;
		var endBracket = 0;

		for (let token of tokens) {
			token = token.replace(/[\n\r]/g, '');
			if (tokencount) {
				var toks = token.split(/\]\]/);
				start = len;
				end = len + toks[0].length;
				startBracket = lenBracket;
				endBracket = lenBracket + toks[0].length;

				this.highlights.push({start: start, end: end, startb: startBracket, endb: endBracket});						
			}
			len += token.length;
			tokencount++;
			lenBracket += token.length + 2;
		}
		return bracketNumber;
	}
	
	parseFireds(logfile: string) {
		var refire = new RegExp('[\[,\]', 'g');
		this.fireds = [];

		var file = new TextFile(logfile);
		var from = 0;
		var to = 0;
		var rulenum = 0;
		var ruleline = 0;

		for (let line of file.getLines()) {
			var tokens = line.split(',fired');
			if (tokens.length > 1) {
				var tts = line.split(refire);
				if (+tts[2] > to) {
					from = +tts[1];
					to = +tts[2];
					rulenum = +tts[3];
					ruleline = +tts[4];
					this.fireds.push({from: from, to: to, rule: rulenum, ruleline: ruleline});						
				}
			}
		}
		return this.fireds.length ? true : false;
	}

	firedFile(pass: number): vscode.Uri {
		var firefile: vscode.Uri = this.anaFile(pass,nlpFileType.TXXT);
		if (!fs.existsSync(firefile.path)) {
			var logfile = this.anaFile(pass);
			this.parseFireds(logfile.path);
			this.writeFiredText(logfile);
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

	setFilesNames(filepath: vscode.Uri) {
		this.basename = path.basename(filepath.path,'.log');
		this.basename = path.basename(this.basename,'.txxt');
		this.basename = path.basename(this.basename,'.pat');
		this.basename = path.basename(this.basename,'.nlp');
		this.logfile = path.join(this.outfolder,this.basename+'.log');
		this.highlightFile = path.join(this.outfolder,this.basename+'.txxt');
		this.inputFile = path.join(this.outfolder,'input.txt');
	}

	writeFiredText(logfile: vscode.Uri): vscode.Uri {
		this.setFilesNames(logfile);
		var logDate: Date = this.fileCreateTime(logfile.path);
		var inputDate: Date = this.fileCreateTime(this.inputFile);
		if (inputDate < logDate && fs.existsSync(this.highlightFile))
			return vscode.Uri.file(this.highlightFile);
		else if (!fs.existsSync(this.inputFile))
			return logfile;

		var file = new TextFile(this.inputFile,false);

		var textfire = '';
		var lastTo = 0;
		var between = '';
		var highlight = '';
		var from = 0;
		var to = 0;

		if (this.fireds.length) {
			for (var i = 0; i < this.fireds.length; i++) {
				from = this.fireds[i].from;
				to = this.fireds[i].to;
				between = file.getText(true).substring(lastTo,from);
				highlight = file.getText(true).substring(from,to+1);
				textfire = textfire.concat(between,'[[',highlight,']]');
				lastTo = to + 1;
			}
			textfire = textfire.concat(file.getText(true).substring(lastTo,file.getText(true).length));
		} else {
			textfire = file.getText(true);
		}

		fs.writeFileSync(this.highlightFile,file.unnormalizeText(textfire),{flag:'w+'});
		this.fireds = [];
		return vscode.Uri.file(this.highlightFile);
	}
}