import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TextFile, nlpFileType } from './textFile';
import { visualText } from './visualText';

export enum moveDirection { UP, DOWN }
export enum seqType { UNKNOWN, NLP, STUB, FOLDER }

export class SequenceFile extends TextFile {
	private seqFileName = 'analyzer.seq';
	private tokens = new Array();
	private passes = new Array();
	private cleanpasses = new Array();
	private pass = '';
	private newcontent: string = '';
	private basenamestub: string = '';
	private seqType = seqType.UNKNOWN;

	constructor() {
		super();
	}

	BaseName(passname: string): string {
		var basename = path.basename(passname,'.pat');
		basename = path.basename(basename,'.nlp');
		return basename;
	}

	setSeqType(filename: string) {
		this.setFileType(filename);

		this.seqType = seqType.NLP;
		var basenamestub = path.basename(filename, '.stub');
		if (this.basenamestub.length < this.basename.length) {
			this.seqType = seqType.STUB;
			this.basename = basenamestub;
        }
    }

	getFileByNumber(num: number): string {
		var filepath = '';
		if (this.passes.length) {
			var line = this.passes[num];
			this.setPass(line);
			filepath = path.join(visualText.analyzer.getSpecDirectory().path,this.tokens[1]+'.'+this.tokens[0]);
		}
		return filepath;
	}

	cleanPasses() {
		this.cleanpasses = [];
		for (let pass of this.passes) {
			this.setPass(pass);
			if (this.isValid()) {
				this.cleanpasses.push(this.cleanLine(pass));
			}					
		}
	}

	renamePass(origpassname: string, newpassname: string) {
		if (this.passes.length) {
			for (var i=0; i < this.passes.length; i++) {
				this.setPass(this.passes[i]);
				if (origpassname.localeCompare(this.getName()) == 0) {
					this.tokens[1] = newpassname;
					this.passes[i] = this.passString();
					break;
				}
			}
			this.saveFile();
		}
	}
	
	insertPass(passafter: vscode.Uri, newpass: vscode.Uri) {
		if (this.passes.length) {
			this.setFile(passafter.path,false);
			var row = this.findPass(this.getBasename());
			if (row >= 0) {
				var newpassstr = this.createPassStrFromFile(newpass.path);
				this.passes.splice(row+1,0,newpassstr);
				this.saveFile();			
			}
		}	
	}
		
	insertNewPass(passafter: vscode.Uri, newpass: string) {
		if (this.passes.length && newpass.length) {
			var passname = '';
			if (this.setFile(passafter.path,false)) {
				passname = this.getBasename();
			} else {
				passname = path.basename(passafter.path,'.stub');
			}
			var row = this.findPass(passname);
			if (row >= 0) {
				var newfile = this.createNewPassFile(newpass);
				var newpassstr = this.createPassStrFromFile(newfile);
				this.passes.splice(row+1,0,newpassstr);
				this.saveFile();			
			}
		}	
	}

	insertNewPassEnd(newpass: string) {
		if (this.passes.length && newpass.length) {
			var newfile = this.createNewPassFile(newpass);
			var newpassstr = this.createPassStrFromFile(newfile);
			this.passes.push(newpassstr);
			this.saveFile();			
		}	
	}

	deletePass(pass: vscode.Uri) {
		if (this.passes.length) {
			this.setFile(pass.path,false);
			var row = this.findPass(this.getBasename());
			if (row >= 0) {
				this.passes.splice(row,1);
			}
			this.saveFile();
		}	
	}

	createNewPassFile(filename: string): string {
		var newfilepath = path.join(visualText.analyzer.getSpecDirectory().path,filename.concat('.pat'));
		fs.writeFileSync(newfilepath,this.newPassContent(filename),{flag:'w+'});
		return newfilepath;
	}

	todayDate(): string {
		var today = new Date();
		var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
		var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
		return date + ' ' + time;
	}

	newPassContent(filename: string) {
		var newpass = '###############################################\n';
		newpass = newpass.concat('# FILE: ',filename,'\n');
		newpass = newpass.concat('# SUBJ: comment\n');
		newpass = newpass.concat('# AUTH: Your Name\n');
		newpass = newpass.concat('# CREATED: ',this.todayDate(),'\n');
		newpass = newpass.concat('# MODIFIED:\n');
		newpass = newpass.concat('###############################################\n\n');

		newpass = newpass.concat('@CODE\n');
		newpass = newpass.concat('L("hello") = 0;\n');
		newpass = newpass.concat('@@CODE\n\n');

		newpass = newpass.concat('@NODES _ROOT\n\n');

		newpass = newpass.concat('@RULES\n');
		newpass = newpass.concat('_xNIL <-\n');
		newpass = newpass.concat('	_xNIL	### (1)\n');
		newpass = newpass.concat('	@@\n');

		return newpass;
	}

	createPassStrFromFile(filepath: string) {
		var name = this.BaseName(filepath);
		var ext = path.extname(filepath).substr(1);
		var passStr: string = '';
		passStr = passStr.concat(ext,'\t',name,'\t# comment');
		return passStr;
	}

	passString(): string {
		var passStr: string = '';
		for (var i=0; i<this.tokens.length; i++) {
			if (passStr.length) {
				if (i < 3)
					passStr = passStr.concat('\t');
				else				
					passStr = passStr.concat(' ');
			}
			passStr = passStr.concat(this.tokens[i]);
		}
		return passStr;
	}

	setPass(pass: string): seqType {
		this.pass = pass;
		this.seqType = seqType.UNKNOWN;
		if (pass.length) {
			this.tokens = pass.split(/[\t\s]/);
			if (this.tokens[0].localeCompare('pat') == 0 || this.tokens[0].localeCompare('rec') == 0)
				this.seqType = seqType.NLP;
			else if (this.tokens[0].localeCompare('tokenize') == 0 || this.tokens[0].localeCompare('stub') == 0 || this.tokens[0].localeCompare('end') == 0)
				this.seqType = seqType.STUB;
		} else
			this.tokens = [];
		return this.seqType;
	}

	cleanLine(pass: string): string {
		var cleanstr: string = '';

		for (var i=0; i < this.tokens.length; i++) {
			if (i == 0)
				cleanstr = this.tokens[i];
			else if (i < 3)
				cleanstr = cleanstr.concat('\t',this.tokens[i]);
			else
				cleanstr = cleanstr.concat(' ',this.tokens[i]);
		}

		return cleanstr;
	}

	isValid() {
		if (this.tokens.length) {
			if (this.tokens.length >= 2 && this.tokens[0].localeCompare('#'))
				return true;
		}
		return false;
	}

	isRuleFile() {
		return this.seqType == seqType.NLP;
	}

	fileName(): string {
		return this.tokens[1].concat('.pat');
	}
	
	getSeqType(): seqType {
		return this.seqType;
	}
	
	init() {
		if (visualText.analyzer.getSpecDirectory()) {
			super.setFile(path.join(visualText.analyzer.getSpecDirectory().path,this.seqFileName),true);
			this.passes = this.getLines();			
		}
	}

	getPasses(): string[] {
		if (this.passes.length == 0) {
			this.init();
		}
		return this.passes;
	}

	getTypeName(): string {
		return this.tokens[0];
	}

	getSpecDirectory(): vscode.Uri {
		return visualText.analyzer.getSpecDirectory();
	}

	getName(): string {
		if (this.tokens[0].localeCompare('tokenize') == 0)
			return this.tokens[0];
		return this.tokens[1];
	}
	
	getStubName(): string {
		if (this.tokens[0].localeCompare('tokenize') == 0)
			return this.tokens[0];
		else if (this.tokens[0].localeCompare('stub') == 0)
			return this.tokens[1];
		else if (this.tokens[0].localeCompare('end') == 0)
			return this.tokens[0].concat('_',this.tokens[1]);
		return this.tokens[1];
	}

	saveFile() {
		this.newcontent = '';
		for (var i = 0; i < this.passes.length; i++) {
			if (i > 0)
				this.newcontent = this.newcontent.concat('\n');
			this.newcontent = this.newcontent.concat(this.passes[i]);
		}

		fs.writeFileSync(path.join(visualText.analyzer.getSpecDirectory().path,this.seqFileName),this.newcontent,{flag:'w+'});
	}

	movePass(direction: moveDirection, row: number) {
		for (var i = 0; i < this.passes.length; i++) {
			if ((direction == moveDirection.UP && i+1 == row) || (direction == moveDirection.DOWN && i == row)) {
				var next = this.passes[i+1];
				this.passes[i+1] = this.passes[i];
				this.passes[i] = next;
				break;
			}
		}
	}

	findPass(passToMatch: string): number {
		var row = 1;
		var found = false;
		passToMatch = this.BaseName(passToMatch);
		for (let pass of this.passes) {
			if (this.setPass(pass) != seqType.UNKNOWN) {
				if (passToMatch.localeCompare(this.getName()) == 0) {
					found = true;
					break;
				}			
				row++;				
			}
		}
		if (!found)
			row = -1;
		return row;
	}
}