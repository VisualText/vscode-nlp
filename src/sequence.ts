import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TextFile, nlpFileType } from './textFile';
import { visualText } from './visualText';
import { endianness } from 'os';

export enum moveDirection { UP, DOWN }

export class PassItem {
	public uri = vscode.Uri.file('');
	public text: string = '';
	public name: string = '';
	public comment: string = '';
	public num: number = 0;
	public typeStr: string = '';

	constructor() {
	}

	public isRuleFile() {
		return this.typeStr.localeCompare('pat') == 0;
	}

	public fileExists(): boolean {
		return fs.existsSync(this.uri.path) ? true : false;
	}

	clear() {
		this.uri = vscode.Uri.file('');
		this.text = '';
		this.name = '';
		this.comment = '';
		this.num = 0;
		this.typeStr = '';
	}
}

export class SequenceFile extends TextFile {
	private specDir = vscode.Uri.file('');
	private seqFileName = 'analyzer.seq';
	private passItems = new Array();
	private cleanpasses = new Array();
	private newcontent: string = '';
	private basenamestub: string = '';

	constructor() {
		super();
	}

	init() {
		if (visualText.analyzer.isLoaded()) {
			this.specDir = visualText.analyzer.getSpecDirectory();
			super.setFile(vscode.Uri.file(path.join(this.specDir.path,this.seqFileName)),true);
			let passNum = 1;
			this.passItems = [];
			for (let passStr of this.getLines()) {
				var passItem = this.setPass(passStr,passNum);
				if (passItem.text.length)
					this.passItems.push(this.setPass(passStr,passNum++));
			}
		}
	}

	setPass(passStr: string, passNum: number): PassItem {
		const passItem = new PassItem();
		var tokens = passStr.split(/[\t\s]/);

		if (tokens.length >= 3) {
			passItem.text = passStr;
			passItem.num = passNum;

			if (tokens[0].localeCompare('#') == 0) {
				passItem.comment = this.tokenStr(tokens,2);
				passItem.typeStr = '#';

			} else {
				passItem.typeStr = tokens[0];
				passItem.name = tokens[1];

				if (tokens[0].localeCompare('pat') == 0 || tokens[0].localeCompare('rec') == 0) {			
					passItem.uri = vscode.Uri.file(path.join(this.specDir.path,this.passFileName(passItem.name)));
				}
				passItem.comment = this.tokenStr(tokens,2);				
			}
		}

		return passItem;
	}

	tokenStr(tokens: string[], start: number): string {
		var tokenStr = '';
		let i = 0;
		let end = tokens.length;
		for (i=start; i<end; i++) {
			var tok = tokens[i];
			if (tokenStr.length)
				tokenStr = tokenStr + ' ';
			tokenStr = tokenStr + tok;
		}
		return tokenStr;
	}

	passString(passItem: PassItem): string {
		return passItem.typeStr + '\t' + passItem.name + '\t' + passItem.comment;
	}

	BaseName(passname: string): string {
		var basename = path.basename(passname,'.pat');
		basename = path.basename(basename,'.nlp');
		return basename;
	}

	getFileByNumber(num: number): string {
		var filepath = '';
		if (this.passItems.length) {
			return this.passItems[num-1].text;
		}
		return '';
	}

	cleanPasses() {
		this.cleanpasses = [];
		let passNum = 1;
		for (let passItem of this.passItems) {
			this.cleanpasses.push(this.passString(passItem));
		}
	}

	renamePass(origPassName: string, newPassName: string) {
		if (this.passItems.length) {
			for (let passItem of this.passItems) {
				if (origPassName.localeCompare(passItem.name) == 0) {
					passItem.name = newPassName;
					break;
				}
			}
			this.saveFile();
		}
	}
	
	insertPass(passafter: vscode.Uri, newpass: vscode.Uri) {
		if (this.passItems.length) {
			var row = this.findPass(path.basename(passafter.path));
			if (row >= 0) {
				var passItem = this.createPassItemFromFile(newpass.path);
				this.passItems.splice(row,0,passItem);
				this.saveFile();			
			}
		}	
	}
		
	insertNewPass(passafter: vscode.Uri, newpass: string) {
		if (this.passItems.length && newpass.length) {
			var passname = '';
			if (this.setFile(passafter,false)) {
				passname = path.basename(passafter.path);
			} else {
				passname = path.basename(passafter.path,'.stub');
			}
			var row = this.findPass(passname);
			if (row >= 0) {
				var newfile = this.createNewPassFile(newpass);
				var passItem = this.createPassItemFromFile(newfile);
				this.passItems.splice(row,0,passItem);
				this.saveFile();			
			}
		}	
	}

	insertNewPassEnd(newpass: string) {
		if (this.passItems.length && newpass.length) {
			var newfile = this.createNewPassFile(newpass);
			var passItem = this.createPassItemFromFile(newfile);
			this.passItems.push(passItem);
			this.saveFile();			
		}
	}

	deletePass(pass: vscode.Uri) {
		if (pass.path.length) {
			this.deletePassInSeqFile(path.basename(pass.path));
		}	
	}

	deletePassInSeqFile(passname: string) {
		var row = this.findPass(passname);
		if (row >= 0) {
			this.passItems.splice(row-1,1);
		}
		this.saveFile();		
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

	createPassItemFromFile(filePath: string): PassItem {
		const passItem = new PassItem();
		passItem.uri = vscode.Uri.file(filePath);
		passItem.name = this.BaseName(filePath);
		passItem.typeStr = path.extname(filePath).substr(1);
		passItem.comment = '# comment';
		passItem.text = this.passString(passItem);
		return passItem;
	}

	passFileName(passName: string): string {
		return passName.concat('.pat');
	}

	getPasses(): PassItem[] {
		if (this.passItems.length == 0) {
			this.init();
		}
		return this.passItems;
	}

	getSequenceFile(): vscode.Uri {
		var uri = visualText.analyzer.getSpecDirectory();
		if (uri.path.length)
			uri = vscode.Uri.file(path.join(visualText.analyzer.getSpecDirectory().path,this.seqFileName));
		return uri;
	}

	getSpecDirectory(): vscode.Uri {
		return visualText.analyzer.getSpecDirectory();
	}

	saveType(passNum: number, type: string) {
		var pass = this.passItems[passNum-1];
		pass.typeStr = type;
		this.saveFile();
	}

	saveActive(passNum: number, active: string) {
		var pass = this.passItems[passNum-1];
		var type = pass.typeStr.replace('/','');
		pass.typeStr = active + type;
		this.saveFile();
	}

	saveFile() {
		this.newcontent = '';
		for (let passItem of this.passItems) {
			if (this.newcontent.length)
				this.newcontent = this.newcontent.concat('\n');
			this.newcontent = this.newcontent.concat(this.passString(passItem));
		}

		fs.writeFileSync(path.join(this.specDir.path,this.seqFileName),this.newcontent,{flag:'w+'});
	}

	movePass(direction: moveDirection, row: number) {
		let i = 0;
		for (let passItem of this.passItems) {
			if ((direction == moveDirection.UP && i+1 == row) || (direction == moveDirection.DOWN && i == row)) {
				this.swapItems(this.passItems[i-1],this.passItems[i]);
				break;
			}
			i++;
		}
	}

	swapItems(itemOne: PassItem, itemTwo: PassItem) {
		var hold = new PassItem();
		this.copyItem(hold,itemOne);
		this.copyItem(itemOne,itemTwo);	
		this.copyItem(itemTwo,hold);
	}

	copyItem(toItem: PassItem, fromItem: PassItem) {
		toItem.name = fromItem.name;
		toItem.num = fromItem.num;
		toItem.text = fromItem.text;
		toItem.typeStr = fromItem.typeStr;
		toItem.uri = fromItem.uri;
		toItem.comment = fromItem.comment;
	}

	findPass(passToMatch: string): number {
		var row = 1;
		var found = false;
		passToMatch = this.BaseName(passToMatch);
		for (let passItem of this.passItems) {
			if (passToMatch.localeCompare(passItem.name) == 0) {
				found = true;
				break;
			}
			row++;	
		}
		if (!found)
			row = -1;
		return row;
	}
}