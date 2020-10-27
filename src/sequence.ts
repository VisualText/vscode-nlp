import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TextFile, nlpFileType } from './textFile';
import { LogFile } from './logfile';

export enum moveDirection { UP, DOWN }
export enum seqType { UNKNOWN, NLP, STUB, FOLDER }

export class SequenceFile extends TextFile {
	private textFile = new TextFile();
	private workingDir: vscode.Uri = vscode.Uri.file('');
	private specfolder: vscode.Uri = vscode.Uri.file('');
	private pass: string = '';
	private tokens = new Array();
	private passes = new Array();
	private cleanpasses = new Array();
	private newcontent: string = '';
	private basenamestub: string = '';
	private seqType = seqType.UNKNOWN;

	constructor() {
		super();
		if (vscode.workspace.workspaceFolders) {
            const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
            if (workspaceFolder) {
				this.SetWorkingDir(workspaceFolder.uri);
			}
		}
	}

	HasWorkingDirectory(): boolean {
		return this.workingDir.path.length ? true : false;
	}

	GetWorkingDirectory(): vscode.Uri {
		return this.workingDir;
	}

	BaseName(passname: string): string {
		var basename = path.basename(passname,'.pat');
		basename = path.basename(basename,'.nlp');
		return basename;
	}

	SetWorkingDir(directory: vscode.Uri) {
		this.workingDir = directory;
		this.specfolder = vscode.Uri.file(path.join(directory.path,'spec'));
		this.passes = fs.readFileSync(path.join(this.specfolder.fsPath, 'analyzer.seq'), 'utf8').split('\n');
		this.CleanPasses();
	}

	SetSeqType(filename: string) {
		this.setFileType(filename);

		this.seqType = seqType.NLP;
		var basenamestub = path.basename(filename, '.stub');
		if (this.basenamestub.length < this.basename.length) {
			this.seqType = seqType.STUB;
			this.basename = basenamestub;
        }
    }

	GetFileByNumber(num: number): string {
		var filepath = '';
		if (this.passes.length) {
			var line = this.passes[num];
			this.SetPass(line);
			filepath = path.join(this.specfolder.path,this.tokens[1]+'.'+this.tokens[0]);
		}
		return filepath;
	}

	CleanPasses() {
		this.cleanpasses = [];
		for (let pass of this.passes) {
			this.SetPass(pass);
			if (this.IsValid()) {
				this.cleanpasses.push(this.CleanLine(pass));
			}					
		}
	}

	RenamePass(origpassname: string, newpassname: string) {
		if (this.passes.length) {
			for (var i=0; i < this.passes.length; i++) {
				this.SetPass(this.passes[i]);
				if (origpassname.localeCompare(this.GetName()) == 0) {
					this.tokens[1] = newpassname;
					this.passes[i] = this.PassString();
					break;
				}
			}
			this.SaveFile();
		}
	}
	
	InsertPass(passafter: vscode.Uri, newpass: vscode.Uri) {
		if (this.passes.length) {
			this.textFile.setFile(passafter.path,false);
			var row = this.FindPass(this.textFile.getBasename());
			if (row >= 0) {
				var newpassstr = this.CreatePassStrFromFile(newpass.path);
				this.passes.splice(row+1,0,newpassstr);
				this.SaveFile();			
			}
		}	
	}
		
	InsertNewPass(passafter: vscode.Uri, newpass: string) {
		if (this.passes.length) {
			this.textFile.setFile(passafter.path,false);
			var row = this.FindPass(this.textFile.getBasename());
			if (row >= 0) {
				var newfile = this.CreateNewPassFile(newpass);
				var newpassstr = this.CreatePassStrFromFile(newfile);
				this.passes.splice(row+1,0,newpassstr);
				this.SaveFile();			
			}
		}	
	}

	DeletePass(pass: vscode.Uri) {
		if (this.passes.length) {
			this.textFile.setFile(pass.path,false);
			var row = this.FindPass(this.textFile.getBasename());
			if (row >= 0) {
				this.passes.splice(row,1);
			}
			this.SaveFile();
		}	
	}

	CreateNewPassFile(filename: string): string {
		var newfilepath = path.join(this.specfolder.path,filename.concat('.pat'));
		fs.writeFileSync(newfilepath,this.NewPassContent(filename),{flag:'w+'});
		return newfilepath;
	}

	TodayDate(): string {
		var today = new Date();
		var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
		var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
		return date + ' ' + time;
	}

	NewPassContent(filename: string) {
		var newpass = '###############################################\n';
		newpass = newpass.concat('# FILE: ',filename,'\n');
		newpass = newpass.concat('# SUBJ: comment\n');
		newpass = newpass.concat('# AUTH: Your Name\n');
		newpass = newpass.concat('# CREATED: ',this.TodayDate(),'\n');
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

	CreatePassStrFromFile(filepath: string) {
		var name = this.BaseName(filepath);
		var ext = path.extname(filepath).substr(1);
		var passStr: string = '';
		passStr = passStr.concat(ext,'\t',name,'\t# comment');
		return passStr;
	}

	PassString(): string {
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

	SetPass(pass: string) {
		this.pass = pass;
		this.seqType = seqType.NLP;
		if (pass.length) {
			this.tokens = pass.split(/[\t\s]/);
			if (this.tokens[0].localeCompare('pat') && this.tokens[0].localeCompare('rec'))
				this.seqType = seqType.STUB;
		} else
			this.tokens = [];
	}

	CleanLine(pass: string): string {
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

	IsValid() {
		if (this.tokens.length) {
			if (this.tokens.length >= 2 && this.tokens[0].localeCompare('#'))
				return true;
		}
		return false;
	}

	IsRuleFile() {
		return this.seqType == seqType.NLP;
	}

	FileName(): string {
		return this.tokens[1].concat('.pat');
	}
	
	GetSeqType(): seqType {
		return this.seqType;
    }

	GetPasses(): any[] {
		return this.passes;
	}

	GetTypeName(): string {
		return this.tokens[0];
	}

	GetSpecFolder(): vscode.Uri {
		return this.specfolder;
	}

	GetName(): string {
		if (this.tokens[0].localeCompare('tokenize') == 0)
			return this.tokens[0];
		return this.tokens[1];
	}
	
	GetStubName(): string {
		if (this.tokens[0].localeCompare('tokenize') == 0)
			return this.tokens[0];
		else if (this.tokens[0].localeCompare('stub') == 0)
			return this.tokens[1];
		else if (this.tokens[0].localeCompare('end') == 0)
			return this.tokens[0].concat('_',this.tokens[1]);
		return this.tokens[1];
	}

	SaveFile() {
		this.newcontent = '';
		for (var i = 0; i < this.passes.length; i++) {
			if (i > 0)
				this.newcontent = this.newcontent.concat('\n');
			this.newcontent = this.newcontent.concat(this.passes[i]);
		}

		fs.writeFileSync(path.join(this.specfolder.path,'analyzer.seq'),this.newcontent,{flag:'w+'});
	}

	MovePass(direction: moveDirection, row: number) {
		for (var i = 0; i < this.passes.length; i++) {
			if ((direction == moveDirection.UP && i+1 == row) || (direction == moveDirection.DOWN && i == row)) {
				var next = this.passes[i+1];
				this.passes[i+1] = this.passes[i];
				this.passes[i] = next;
				break;
			}
		}
	}

	FindPass(passToMatch: string): number {
		var r = 0;
		var found = false;
		for (let pass of this.passes) {
			this.SetPass(pass);
			if (passToMatch.localeCompare(this.GetName()) == 0) {
				found = true;
				break;
			}			
			r++;
		}
		if (!found)
			r = -1;
		return r;
	}
}