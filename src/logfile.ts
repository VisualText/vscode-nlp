import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { moveDirection, nlpFileType, SequenceFile } from './sequence';
import { TextFile } from './textFile';
import { isAbsolute } from 'path';

export let logFile: LogFile;
export class LogFile {
	
    private seqFile = new SequenceFile();
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

    findRule(file: vscode.Uri, position: vscode.Position) {
		var filepath = '';
		this.seqFile.SetFile(file.path);
		if (this.seqFile.GetFileType() == nlpFileType.TXXT) {
			this.setFilesNames(file);

			if (this.parseBrackets()) {
				this.parseFireds(this.logfile);
				var absolute = this.lineCharacterToAbsolute(position);

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
		return filepath;
	}

	findSelectedTree(file: vscode.Uri, selection: vscode.Selection) {
		var treefile = '';
		this.seqFile.SetFile(file.path);

		if (this.seqFile.GetFileType() == nlpFileType.TXXT) {
			this.setFilesNames(file);
			this.absoluteRangeFromSelection(this.highlightFile, selection);	
			var treeseg = this.findLogfileLines();
			var filename = this.basename + '-' + this.selStart.toString() + '-' + this.selEnd.toString() + '.log';
			this.openNewFile(filename,treeseg);
		}
		return treefile;
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

	findLogfile(resource: vscode.Uri, nlpType: nlpFileType): vscode.Uri {
		var logfile = vscode.Uri.file('');
		var firefile = vscode.Uri.file('');

		const filenames = fs.readdirSync(this.outfolder);
		const restoks = path.basename(resource.path).split('.');
		const baser = restoks[0];

		var arrayLength = filenames.length;
		var re = new RegExp('\\w+', 'g');
		var refire = new RegExp('[\[,\]', 'g');
		var file = new TextFile();

		this.fireds = [];

		for (let filename of filenames) {
			if (filename.endsWith('.log') || filename.endsWith('.kb')) {
				file.setFile(path.join(this.outfolder,filename));
				var l = 0;
				var found = false;
				var from = 0;
				var to = 0;

				for (let line of file.getLines()) {
					if (found) {
						var tokens = line.split(',fired');
						if (tokens.length > 1) {
							var tts = line.split(refire);
							if (+tts[2] > to) {
								from = +tts[1];
								to = +tts[2];
								this.fireds.push({from: from, to: to});						
							}
						}
					}
					else if (l++ == 2) {
						var toks = line.match(re);
						if (toks) {
							var base = path.basename(resource.path,'.pat');
							if (baser.localeCompare(toks[2]) == 0) {
								if (nlpType == nlpFileType.KB) {
									var anafile = path.basename(filename,'.log');
									filename = anafile.concat('.kb');
									return vscode.Uri.file(path.join(this.outfolder,filename));
								}
								else if (nlpType == nlpFileType.LOG) {
									return vscode.Uri.file(path.join(this.outfolder,filename));
								}
								logfile = vscode.Uri.file(path.join(this.outfolder,filename));
								found = true;
							}	
						} else {
							return vscode.Uri.file(path.join(this.outfolder,'final.log'));
						}
					} else if (l > 2) {
						break;
					}
				}
				if (found) {
					return this.writeFiredText(logfile);
				}
			}
		}

		return logfile;
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