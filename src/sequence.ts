import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export enum moveDirection { UP, DOWN }
export enum seqType { NLP, STUB }
export enum nlpFileType { NLP, TXXT, LOG, KB }

export class SequenceFile {
	private workingDir: vscode.Uri = vscode.Uri.file('');
	private specfolder: vscode.Uri = vscode.Uri.file('');
	private pass: string = '';
	private type: seqType = seqType.NLP;
	private filetype: nlpFileType = nlpFileType.NLP;
	private tokens = new Array();
	private passes = new Array();
	private cleanpasses = new Array();
	private basename: string = '';
	private newcontent: string = '';

	constructor() {
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
			this.SetFile(passafter.path);
			var row = this.FindPass(this.GetBasename());
			if (row >= 0) {
				var newpassstr = this.CreatePassStrFromFile(newpass.path);
				this.passes.splice(row+1,0,newpassstr);
				this.SaveFile();			
			}
		}	
	}
		
	InsertNewPass(passafter: vscode.Uri, newpass: string) {
		if (this.passes.length) {
			this.SetFile(passafter.path);
			var row = this.FindPass(this.GetBasename());
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
			this.SetFile(pass.path);
			var row = this.FindPass(this.GetBasename());
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
		this.type = seqType.NLP;
		if (pass.length) {
			this.tokens = pass.split(/[\t\s]/);
			if (this.tokens[0].localeCompare('pat') && this.tokens[0].localeCompare('rec'))
				this.type = seqType.STUB;
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
		return this.type == seqType.NLP;
	}

	FileName(): string {
		return this.tokens[1].concat('.pat');
	}

	GetPasses(): any[] {
		return this.passes;
	}
	
	GetType(): seqType {
		return this.type;
	}

	GetFileType(): nlpFileType {
		return this.filetype;
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

	SetFile(filename: string): seqType {
		this.type = seqType.NLP;
		this.basename = path.basename(filename, '.nlp');
		this.basename = path.basename(this.basename, '.pat');
		var basenamestub = path.basename(filename, '.stub');
		if (basenamestub.length < this.basename.length) {
			this.type = seqType.STUB;
			this.basename = basenamestub;
			return seqType.STUB;
		}
		this.filetype = nlpFileType.NLP
		if (path.extname(filename) == '.txxt')
			this.filetype = nlpFileType.TXXT;
		else if (path.extname(filename) == '.kb')
			this.filetype = nlpFileType.KB;
		else if (path.extname(filename) == '.log')
			this.filetype = nlpFileType.LOG;
		return this.type;
	}

	GetBasename(): string {
		return this.basename;
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