import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { moveDirection, nlpFileType, SequenceFile } from './sequence';
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
    
	constructor() {
		this.setOutputFolder(path.join(this.seqFile.GetWorkingDirectory().path,'output'));
	}

    findRule(file: vscode.Uri, position: vscode.Position) {
		var filepath = '';
		this.seqFile.SetFile(file.path);
		if (this.seqFile.GetFileType() == nlpFileType.TXXT) {
			this.fileGroup(file);

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
		var contentstr = fs.readFileSync(this.highlightFile, 'utf8');
		var lines = contentstr.split('\r');
		if (lines.length == 1)
			lines = contentstr.split('\n');
		var lineCount = 0;
		var absolute = 0;

		for (let line of lines) {
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

		var tokens = fs.readFileSync(this.highlightFile, 'utf8').split(/\[\[/);
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

		var lines = fs.readFileSync(logfile, 'utf8').split('\n');
		var from = 0;
		var to = 0;
		var rulenum = 0;
		var ruleline = 0;

		for (let line of lines) {
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

		this.fireds = [];

		for (let filename of filenames) {
			if (filename.endsWith('.log')) {
				var lines = fs.readFileSync(path.join(this.outfolder,filename), 'utf8').split('\n');
				var l = 0;
				var found = false;
				var from = 0;
				var to = 0;

				for (let line of lines) {
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

	fileGroup(filepath: vscode.Uri) {
		this.basename = path.basename(filepath.path,'.log');
		this.basename = path.basename(this.basename,'.txxt');
		this.basename = path.basename(this.basename,'.pat');
		this.basename = path.basename(this.basename,'.nlp');
		this.logfile = path.join(this.outfolder,this.basename+'.log');
		this.highlightFile = path.join(this.outfolder,this.basename+'.txxt');
		this.inputFile = path.join(this.outfolder,'input.txt');
	}

	writeFiredText(logfile: vscode.Uri): vscode.Uri {
		this.fileGroup(logfile);
		var logDate: Date = this.fileCreateTime(logfile.path);
		var inputDate: Date = this.fileCreateTime(this.inputFile);
		if (inputDate < logDate && fs.existsSync(this.highlightFile))
			return vscode.Uri.file(this.highlightFile);
		else if (!fs.existsSync(this.inputFile))
			return logfile;

		var text = fs.readFileSync(this.inputFile, 'utf8');
		const regReplace = new RegExp('\r\n', 'g');
		text = text.replace(regReplace, '\r');

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
				between = text.substring(lastTo,from);
				highlight = text.substring(from,to+1);
				textfire = textfire.concat(between,'[[',highlight,']]');
				lastTo = to + 1;
			}
			textfire = textfire.concat(text.substring(lastTo,text.length));
		} else {
			textfire = text;
		}

		fs.writeFileSync(this.highlightFile,textfire,{flag:'w+'});

		this.fireds = [];

		const regBack = new RegExp('\r', 'g');
		text = text.replace(regBack, '\r\n');
		return vscode.Uri.file(this.highlightFile);
	}
}