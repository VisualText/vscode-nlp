import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SequenceItem } from './sequenceView';
import { TextFile, nlpFileType } from './textFile';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';

export enum moveDirection { UP, DOWN }

export class PassItem {
	public uri = vscode.Uri.file('');
	public text: string = '';
	public name: string = '';
	public comment: string = '';
	public passNum: number = 0;
	public order: number = 0;
	public typeStr: string = '';
	public inFolder: boolean = false;
	public empty: boolean = true;

	constructor() {
	}

	public isRuleFile() {
		return this.typeStr.localeCompare('pat') == 0 || this.typeStr.localeCompare('rec') == 0;
	}
	
	public isFolder() {
		return this.typeStr.localeCompare('folder') == 0;
	}
		
	public isStub() {
		return this.typeStr.localeCompare('stub') == 0;
	}
		
	public isEnd(name: string) {
		return this.typeStr.localeCompare('end') == 0 && this.name.localeCompare(name) == 0;
	}

	public fileExists(): boolean {
		return fs.existsSync(this.uri.path) ? true : false;
	}

	clear() {
		this.uri = vscode.Uri.file('');
		this.text = '';
		this.name = '';
		this.comment = '';
		this.passNum = 0;
		this.typeStr = '';
		this.inFolder = false;
	}
}

export class SequenceFile extends TextFile {
	private specDir = vscode.Uri.file('');
	private seqFileName = 'analyzer.seq';
	private passItems = new Array();
	private cleanpasses = new Array();
	private newcontent: string = '';

	constructor() {
		super();
	}

	init() {
		if (visualText.analyzer.isLoaded()) {
			this.specDir = visualText.analyzer.getSpecDirectory();
			super.setFile(vscode.Uri.file(path.join(this.specDir.path,this.seqFileName)),true);
			let passNum = 1;
			this.passItems = [];
			var folder = '';
			var order = 0;

			for (let passStr of this.getLines()) {
				var passItem = this.setPass(passStr,passNum);
				if (passItem.typeStr == 'folder' || passItem.typeStr == 'stub') {
					folder = passItem.name;
				} else if (folder.length) {
					if (passItem.typeStr == 'end' &&  passItem.name.localeCompare(folder) == 0) {
						folder = '';
					} else {
						passItem.inFolder = true;
						passNum++;
					}
				} else
					passNum++;

				if (passItem.text.length) {
					passItem.order = order++;
					this.passItems.push(passItem);
				}
			}
		}
	}

	setPass(passStr: string, passNum: number): PassItem {
		const passItem = new PassItem();
		var tokens = passStr.split(/[\t\s]/);

		if (tokens.length >= 3) {
			passItem.text = passStr;
			passItem.passNum = passNum;

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

	base(passname: string): string {
		var basename = path.basename(passname,'.pat');
		basename = path.basename(basename,'.nlp');
		return basename;
	}

	getUriByPassNumber(passNumber: number): vscode.Uri {
		var filepath = '';
		for (let passItem of this.passItems) {
			if (passItem.passNum == passNumber)
				return passItem.uri;
		}
		return vscode.Uri.file('');
	}

	passCount(): number {
		return this.passItems.length;
	}

	atBottom(passItem: PassItem): boolean {
		let passes = this.getFolderPasses(passItem.typeStr,passItem.name,true);
		return passes.length + passItem.order == this.passCount();
	}

	insertFolder(passafter: vscode.Uri) {
		if (passafter.path.length > 1) {
			this.saveFile();
		}
	}

	cleanPasses() {
		this.cleanpasses = [];
		let passNum = 1;
		for (let passItem of this.passItems) {
			this.cleanpasses.push(this.passString(passItem));
		}
	}

	renamePass(seqItem: SequenceItem, newPassName: string) {
		if (this.passItems.length) {
			var passItem = this.passItems[seqItem.passNum-1];
			if (seqItem.type.localeCompare('folder') == 0) {
				var passes = this.getFolderPasses(seqItem.type,seqItem.name,true);
				passes[passes.length-1].name = newPassName;
			}
			passItem.name = newPassName;
			this.saveFile();
		}
	}
	
	insertPass(seqItem: SequenceItem, newpass: vscode.Uri) {
		if (this.passItems.length) {
			var row = seqItem.passNum;

			if (row >= 0) {
				var passes = new Array();
				passes.push(newpass);
				var copy = false;
				var specDir = visualText.analyzer.getSpecDirectory().path;

				if (specDir.localeCompare(path.dirname(newpass.path))) {
					if (dirfuncs.isDir(newpass.path)) {
						passes = [];
						passes = dirfuncs.getFiles(newpass);
					}
					copy = true;
				}
				for (let pass of passes) {
					if (copy) {
						var herepass = path.join(specDir,path.basename(pass.path));
						fs.copyFileSync(pass.path,herepass);								
					}		
					var passItem = this.createPassItemFromFile(pass.path);
					this.passItems.splice(row,0,passItem);
					row++;
				}
				this.saveFile();			
			}
		}	
	}
		
	insertNewPass(seqItem: SequenceItem, newPass: string) {
		if (this.passItems.length && newPass.length) {
			var foundItem = this.findPass(seqItem.type,seqItem.name);
			if (foundItem) {
				var newfile = this.createNewPassFile(newPass);
				var passItem = this.createPassItemFromFile(newfile);
				this.passItems.splice(foundItem.order+1,0,passItem);
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

	insertNewFolder(seqItem: SequenceItem, newFolder: string) {
		if (this.passItems.length && newFolder.length) {
			var foundItem = this.findPass(seqItem.type,seqItem.name);
			if (foundItem) {
				var passItem = this.createPassItemFolder('end',newFolder);
				this.passItems.splice(foundItem.order,0,passItem);
				passItem = this.createPassItemFolder('folder',newFolder);
				this.passItems.splice(foundItem.order,0,passItem);
				this.saveFile();	
			}		
		}
	}

	insertNewFolderEnd(newFolder: string) {
		if (this.passItems.length && newFolder.length) {
			var passItem = this.createPassItemFolder('folder',newFolder);
			this.passItems.push(passItem);
			passItem = this.createPassItemFolder('end',newFolder);
			this.passItems.push(passItem);
			this.saveFile();			
		}	
	}

	createPassItemFolder(type: string, name: string): PassItem {
		var passItem = new PassItem();
		passItem.typeStr = type;
		passItem.name = name;
		passItem.comment = '# new folder';
		return passItem;
	}

	deletePass(seqItem: SequenceItem) {
		let passItem = this.findPass(seqItem.type,seqItem.name);
		if (passItem.isFolder()) {
			this.deleteFolder(passItem);
		} else
			this.deletePassInSeqFile(passItem.typeStr,passItem.name);
		this.saveFile();
	}

	deleteFolder(passItem: PassItem) {
		let passes = this.getFolderPasses(passItem.typeStr,passItem.name,true);
		this.passItems.splice(passes[0].order,passes.length);
	}

	deletePassInSeqFile(type: string, name: string) {
		var passItem = this.findPass(type, name);
		if (passItem) {
			this.passItems.splice(passItem.order,1);
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

	createPassItemFromFile(filePath: string): PassItem {
		const passItem = new PassItem();
		passItem.uri = vscode.Uri.file(filePath);
		passItem.name = this.base(filePath);
		passItem.typeStr = path.extname(filePath).substr(1);
		passItem.comment = '# comment';
		passItem.text = this.passString(passItem);
		return passItem;
	}

	passFileName(passName: string): string {
		return passName.concat('.pat');
	}

	getFolderPasses(type: string, name: string, includeStubs: boolean = false): PassItem[]  {
		var passes = Array();
		var collect = '';

		for (let pass of this.getPasses()) {

			if (collect.length == 0 && pass.typeStr.localeCompare(type) == 0 && pass.name.localeCompare(name) == 0) {
				collect = pass.name;
				if (includeStubs)
					passes.push(pass);

			} else if (collect.length) {
				if (pass.typeStr.localeCompare('end') == 0 && pass.name.localeCompare(collect) == 0) {
					if (includeStubs)
						passes.push(pass);
					break;
				} else {
					passes.push(pass);
				}
			}
		}

		return passes;
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

	getLibraryDirectory(): vscode.Uri {
		return vscode.Uri.file(visualText.getVisualTextDirectory('spec'));
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

	movePass(seqItem: SequenceItem, direction: moveDirection) {
		let passItem = this.findPass(seqItem.type, seqItem.name);
		let order = passItem.order;

		if (passItem.isRuleFile()) {
			if (direction == moveDirection.UP) {
				let prev = this.passItems[order-1];			
				this.swapItems(passItem,prev);

			} else {
				let next = this.passItems[order+1];			
				this.swapItems(passItem,next);
			}

		} else {
			let nextTop = this.nextTop(passItem);
			let prevTop = this.prevTop(passItem);

			if (direction == moveDirection.DOWN && nextTop.isFolder()) {
				let passesOne = this.getFolderPasses(seqItem.type,seqItem.name,true);
				let passesTwo = this.getFolderPasses(nextTop.typeStr,nextTop.name,true);
				let totalPassCount = passesOne.length + passesTwo.length - 1;

				let i = 0;
				let top = passesOne[0].order;
				for (i=0; i<passesOne.length; i++) {
					let pass = this.passItems[top];
					this.moveCount(pass,totalPassCount);
				}

			} else if (direction == moveDirection.UP && prevTop.isFolder()) {
				let passesOne = this.getFolderPasses(prevTop.typeStr,prevTop.name,true);
				let passesTwo = this.getFolderPasses(seqItem.type,seqItem.name,true);
				let totalPassCount = passesOne.length + passesTwo.length - 1;

				let i = 0;
				let top = passesOne[0].order;
				for (i=0; i<passesOne.length; i++) {
					let pass = this.passItems[top];
					this.moveCount(pass,totalPassCount);
				}

			} else {
				let passes = this.getFolderPasses(seqItem.type,seqItem.name,true);
				order = direction == moveDirection.UP ? order - 1 : order + 1;
				let other = this.passItems[order];	
				for (let pass of passes) {
					this.swapItems(other,pass);
					if (direction == moveDirection.UP)
						other = pass;
				}					
			}
		}
	}

	moveCount(passItem: PassItem, count: number) {
		let i = 0;
		let pass = passItem;
		let next = passItem;
		for (i=passItem.order; i<count+passItem.order; i++ ) {
			next = this.passItems[i+1];
			this.swapItems(pass,next);
			pass = next;
		}
		this.passItems;
	}

	prevTop(passItem: PassItem): PassItem {
		let order = passItem.order;
		let prev = this.passItems[--order];
		while (prev.inFolder || prev.typeStr.localeCompare('end') == 0) {
			prev = this.passItems[--order];
		}
		return prev;
	}

	nextTop(passItem: PassItem): PassItem {
		let order = passItem.order;
		let next = this.passItems[++order];
		while (next.inFolder) {
			next = this.passItems[++order];
		}
		if (next.typeStr.localeCompare('end') == 0)
			next = this.passItems[++order];
		return next;
	}

	swapItems(itemOne: PassItem, itemTwo: PassItem) {
		var hold = new PassItem();
		this.copyItem(hold,itemOne);
		this.copyItem(itemOne,itemTwo);	
		this.copyItem(itemTwo,hold);
	}

	copyItem(toItem: PassItem, fromItem: PassItem) {
		toItem.name = fromItem.name;
		toItem.passNum = fromItem.passNum;
		toItem.text = fromItem.text;
		toItem.typeStr = fromItem.typeStr;
		toItem.uri = fromItem.uri;
		toItem.comment = fromItem.comment;
	}

	findPass(type: string, name: string): PassItem {
		var row = 1;
		var found = false;
		for (let passItem of this.passItems) {
			if (type.localeCompare(passItem.typeStr) == 0 && name.localeCompare(passItem.name) == 0) {
				return passItem;
			}
		}
		return new PassItem();
	}
}