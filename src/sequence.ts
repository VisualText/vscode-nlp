import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SequenceItem } from './sequenceView';
import { TextFile, nlpFileType } from './textFile';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';
import { TreeFile } from './treeFile';
import { NLPFile } from './nlp';

export enum moveDirection { UP, DOWN }
export enum newPassType { RULES, CODE, DECL }

export class PassItem {
	public uri = vscode.Uri.file('');
	public library = vscode.Uri.file('');
	public text: string = '';
	public name: string = '';
	public comment: string = '';
	public passNum: number = 0;
	public row: number = 0;
	public tokenizer: boolean = false;
	public typeStr: string = '';
	public inFolder: boolean = false;
	public empty: boolean = true;
	public active: boolean = true;

	public tokenizers: string[] = ['tokenize','tok','token','cmltokenize','cmltok','dicttok','dicttokz','chartok'];
	public tokenizerTooltips: string[] = ['separate alphanumerics, numerics, and special','separate alphanumerics, numerics, and special','separate alphanumerics, numerics, and special','cml tokenizer (rarely used)','cml tokenizer (rarely used)','dictionary lookup','dictionary lookup no whitespace','separate all into characters'];

	constructor() {
	}

	public isTokenizer() {
		return this.tokenizers.includes(this.typeStr.toLowerCase());
	}

	public fetchTooltip(): string {
		var index = this.tokenizers.indexOf(this.typeStr);
		var tooltip = this.tokenizerTooltips[index];
		return tooltip;
	}

	public isRuleFile(): boolean {
		return this.typeStr.localeCompare('nlp') == 0 || this.typeStr.localeCompare('rec') == 0;
	}
	
	public isFolder(): boolean {
		return this.typeStr.localeCompare('folder') == 0;
	}
		
	public isStub(): boolean {
		return this.typeStr.localeCompare('stub') == 0;
	}
	
	public isEnd(name: string) {
		return this.typeStr.localeCompare('end') == 0 && this.name.localeCompare(name) == 0;
	}

	public fileExists(): boolean {
		return fs.existsSync(this.uri.fsPath) ? true : false;
	}

	public exists(): boolean {
		return this.empty ? false : true;
	}

	public isEmpty(): boolean {
		return this.empty;
	}

	clear() {
		this.uri = vscode.Uri.file('');
		this.text = '';
		this.name = '';
		this.comment = '';
		this.passNum = 0;
		this.row = 0;
		this.typeStr = '';
		this.inFolder = false;
		this.empty = true;
		this.active = true;
	}
}

export class SequenceFile extends TextFile {
	private specDir = vscode.Uri.file('');
	private passItems = new Array();
	private cleanpasses = new Array();
	private newcontent: string = '';

	constructor() {
		super();
	}

	init() {
		if (visualText.analyzer.isLoaded()) {
			this.specDir = visualText.analyzer.getSpecDirectory();
			this.getPassFiles(this.specDir.fsPath);
		}
	}

	public setSpecDir(specDir: string) {
		this.specDir = vscode.Uri.file(specDir);
	}

	libraryFileCheck() {
		for (let passItem of this.passItems) {
			passItem.library = vscode.Uri.file(this.getLibraryFile(passItem.uri.fsPath));
			if (passItem.library.fsPath.length > 2) {
				let moose = 1;
			}
		}
	}

	public getPassFiles(specDir: string, addSpec: boolean = false) {
		specDir = addSpec ? path.join(specDir,visualText.ANALYZER_SEQUENCE_FOLDER) : specDir;
		if (addSpec) 
			this.setSpecDir(specDir);

		const anaFile = path.join(specDir,visualText.ANALYZER_SEQUENCE_FILE);
		super.setFile(vscode.Uri.file(anaFile),true);
		let passNum = 1;
		this.passItems = [];
		var folder = '';
		var row = 0;

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
			} else if (passItem.exists())
				passNum++;

			if (passItem.text.length) {
				passItem.row = row++;
				passItem.uri = vscode.Uri.file(path.join(specDir,passItem.name + '.nlp'));
				passItem.library = vscode.Uri.file(this.getLibraryFile(passItem.uri.fsPath));
				this.passItems.push(passItem);
			}
		}
	}

	public getPassItemFiles(): vscode.Uri[] {
		let files: vscode.Uri[] = new Array();
		for (let passItem of this.passItems) {
			files.push(passItem.uri);
		}
		return files;
	}

	public getPassItems() {
		return this.passItems;
	}

	public getLastItem(): PassItem {
		return this.passItems[this.passItems.length-1];
	}

	public getLastItemInFolder(row: number): PassItem {
		let folderItem = this.passItems[row];
		for (let i=row; i<this.passItems.length; i++) {
			let passItem = this.passItems[i];
			if (passItem.name.localeCompare(folderItem.name) == 0 && passItem.typeStr.localeCompare('end') == 0)
				return passItem;
		}
		return folderItem;
	}

	isOrphan(nlpFileName: string): boolean {
		for (let passItem of this.passItems) {
			if (passItem.name.localeCompare(nlpFileName) == 0)
				return false;
		}
		return true;
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
				var clean = tokens[0].replace('/','');
				if (clean.length < tokens[0].length) {
					passItem.active = false;
					passItem.typeStr = clean;
				} else {
					passItem.active = true;
					passItem.typeStr = tokens[0];
					if (passItem.isTokenizer()) {
						passItem.tokenizer = true;
					}
				}
				passItem.name = tokens[1];
				if (passItem.typeStr.localeCompare('pat') == 0) {
					passItem.typeStr = 'nlp';
				}

				if (passItem.typeStr.localeCompare('nlp') == 0 || passItem.typeStr.localeCompare('rec') == 0) {
					passItem.uri = this.passItemUri(passItem);
				}
				passItem.comment = this.tokenStr(tokens,2);				
			}
			passItem.empty = false;
		}

		return passItem;
	}

	passItemUri(passItem: PassItem): vscode.Uri {
		passItem.uri = vscode.Uri.file(path.join(this.specDir.fsPath,passItem.name + '.pat'));
		if (!fs.existsSync(passItem.uri.fsPath))
			passItem.uri = vscode.Uri.file(path.join(this.specDir.fsPath,passItem.name + '.nlp'));
		return passItem.uri;
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
		var activeStr = passItem.active ? '' : '/';
		return activeStr + passItem.typeStr + '\t' + passItem.name + '\t' + passItem.comment;
	}

	base(passname: string): string {
		var basename = path.basename(passname,'.pat');
		basename = path.basename(basename,'.nlp');
		return basename;
	}

	getPassByRow(row: number): PassItem {
		for (let passItem of this.passItems) {
			if (passItem.row == row)
				return passItem;
		}
		return new PassItem();
	}

	getPassByNumber(passNumber: number): PassItem {
		for (let passItem of this.passItems) {
			if (passItem.passNum == passNumber)
				return passItem;
		}
		return new PassItem();
	}

	getUriByPassNumber(passNumber: number): vscode.Uri {
		var passItem = this.getPassByNumber(passNumber);
		if (!passItem.isEmpty())
			return passItem.uri;
		return vscode.Uri.file('');
	}

	passCount(): number {
		return this.passItems.length;
	}

	atBottom(passItem: PassItem): boolean {
		let passes = this.getFolderPasses(passItem.typeStr,passItem.name,true);
		return passes.length + passItem.row == this.passCount();
	}

	cleanPasses() {
		this.cleanpasses = [];
		let passNum = 1;
		for (let passItem of this.passItems) {
			this.cleanpasses.push(this.passString(passItem));
		}
	}

	inFolder(passItem: PassItem): boolean {
		var passes = this.getPasses();
		var row = passes[passItem.row].row;
		while (row) {
			row--;
			var currentPass = passes[row];
			if (currentPass.typeStr == 'end') {
				return false;
			}
			else if (currentPass.typeStr == 'folder') {
				return true;
			}
		}
		return false;
	}

	renamePass(seqItem: SequenceItem, newPassName: string) {
		if (this.passItems.length) {
			var passItem = this.findPass(seqItem.type,seqItem.name);
			if (seqItem.type.localeCompare('folder') == 0) {
				var passes = this.getFolderPasses(seqItem.type,seqItem.name,true);
				passes[passes.length-1].name = newPassName;
			}
			passItem.name = newPassName;
			this.saveFile();
		}
	}

	duplicatePass(seqItem: SequenceItem, newPassName: string) {
		if (this.passItems.length) {
			var passItem = this.findPass(seqItem.type,seqItem.name);
			var dupePath = path.join(path.dirname(passItem.uri.fsPath),newPassName + '.nlp');
			fs.copyFileSync(passItem.uri.fsPath,dupePath);									
			var dupeItem = this.createPassItemFromFile(dupePath);
			this.passItems.splice(passItem.row+1,0,dupeItem);
			this.saveFile();
		}
	}
	
	insertPass(row: number, newpass: vscode.Uri): number {
		if (this.passItems.length) {

			if (row >= 0) {
				var passes = new Array();
				passes.push(newpass);
				var copy = false;
				var specDir = visualText.analyzer.getSpecDirectory().fsPath;

				if (specDir.localeCompare(path.dirname(newpass.fsPath))) {
					if (dirfuncs.isDir(newpass.fsPath)) {
						passes = [];
						passes = dirfuncs.getFiles(newpass);
					}
					copy = true;
				}
				var pi = this.passItems[0];
				for (let pass of passes) {
					var passPath = path.join(specDir,path.basename(pass.fsPath));
					if (copy) {
						fs.copyFileSync(pass.fsPath,passPath);								
					}		
					pi = this.createPassItemFromFile(passPath);
					row++;
					this.passItems.splice(row,0,pi);
				}
				this.saveFile();
				this.renumberPasses();
			}
		}
		return row;
	}

	findPassByFilename(filename: string): number {
		var passes = this.getPasses();
		var name = path.parse(filename).name;
		for (let pass of passes) {
			if (pass.name == name) {
				return pass.passNum;
			}
		}
		return 0;
	}
		
	insertNewPass(seqItem: SequenceItem, newPass: string, type: newPassType) {
		if (this.passItems.length && newPass.length) {
			var foundItem = this.findPass(seqItem.type,seqItem.name);
			if (foundItem) {
				var newfile = this.createNewPassFile(newPass,type);
				var passItem = this.createPassItemFromFile(newfile);
				this.passItems.splice(foundItem.row+1,0,passItem);
				this.saveFile();			
			}
		}	
	}

	insertNewPassEnd(newpass: string, type: newPassType) {
		if (this.passItems.length && newpass.length) {
			var newfile = this.createNewPassFile(newpass,type);
			var passItem = this.createPassItemFromFile(newfile);
			this.passItems.push(passItem);
			this.saveFile();			
		}
	}
			
	insertNewFolderPass(row: number, folderName: string, type: string): number {
		const passItem = this.getPassByRow(row);
		if (folderName.length) {
			if (passItem) {
				const newPassItem = this.createPassItemFolder(type,folderName);
				newPassItem.row = row+1;
				newPassItem.passNum = passItem.passNum;
				this.passItems.splice(newPassItem.row,0,newPassItem);
				this.saveFile();
				return newPassItem.row;		
			}
		}
		return row;
	}

	insertNewFolder(seqItem: SequenceItem, newFolder: string) {
		if (this.passItems.length && newFolder.length) {
			var foundItem = this.findPass(seqItem.type,seqItem.name);
			if (foundItem) {
				if (foundItem.isFolder()) {
					foundItem = this.moveToFolderEnd(foundItem);
				}	
				var passItem = this.createPassItemFolder('end',newFolder);
				this.passItems.splice(foundItem.row+1,0,passItem);
				passItem = this.createPassItemFolder('folder',newFolder);
				this.passItems.splice(foundItem.row+1,0,passItem);
				this.saveFile();	
			}		
		}
	}

	moveToFolderEnd(passItem: PassItem): PassItem {
		var passes = this.getFolderPasses(passItem.typeStr,passItem.name,true);
		return passes[passes.length-1];
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

	deleteFolder(passItem: PassItem, foldersOnly: boolean=false) {
		let passes = this.getFolderPasses(passItem.typeStr,passItem.name,true);
		if (foldersOnly) {
			let len = passes.length;
			let first = passes[0];
			let last = passes[len-1];
			this.deletePassInSeqFile(last.typeStr,last.name);
			this.deletePassInSeqFile(first.typeStr,first.name);
		} else {
			this.passItems.splice(passes[0].row,passes.length);
		}
	}

	deletePassInSeqFile(type: string, name: string) {
		var passItem = this.findPass(type, name);
		if (passItem) {
			this.passItems.splice(passItem.row,1);
		}
	}

	createNewPassFile(filename: string, type: newPassType): string {
		var newfilepath = path.join(visualText.analyzer.getSpecDirectory().fsPath,filename.concat('.nlp'));
		fs.writeFileSync(newfilepath,this.newPassContent(filename,type),{flag:'w+'});
		return newfilepath;
	}

	todayDate(): string {
		var today = new Date();
		var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
		var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
		return date + ' ' + time;
	}

	newPassContent(filename: string, type: newPassType) {
		const config = vscode.workspace.getConfiguration('user');
        var username = config.get<string>('name');
		if (username?.length == 0)
			username = 'Your Name';
		var newpass = '###############################################\n';
		newpass = newpass.concat('# FILE: ',filename,'\n');
		newpass = newpass.concat('# SUBJ: comment\n');
		newpass = newpass.concat(`# AUTH: ${username}\n`);
		newpass = newpass.concat('# CREATED: ',this.todayDate(),'\n');
		newpass = newpass.concat('# MODIFIED:\n');
		newpass = newpass.concat('###############################################\n\n');

		switch (type) {
			case newPassType.RULES:
				newpass = newpass.concat('@NODES _ROOT\n\n');

				newpass = newpass.concat('@RULES\n');
				newpass = newpass.concat('_xNIL <-\n');
				newpass = newpass.concat('	_xNIL	### (1)\n');
				newpass = newpass.concat('	@@\n');
				break;

			case newPassType.CODE:
				newpass = newpass.concat('@CODE\n\n');
				newpass = newpass.concat('G("kb") = getconcept(findroot(),"kb");\n');
				newpass = newpass.concat('SaveKB("mykb.kbb",G("kb"),2);\n');
				newpass = newpass.concat('\n@@CODE');
				break;

			case newPassType.DECL:
				newpass = newpass.concat('@DECL\n\n');
				newpass = newpass.concat('MyFunction(L("var")) {\n');
				newpass = newpass.concat('\n');
				newpass = newpass.concat('}\n');
				newpass = newpass.concat('\n@@DECL');
				break;
		}

		return newpass;
	}

	createPassItemFromFile(filePath: string): PassItem {
		const passItem = new PassItem();
		passItem.uri = vscode.Uri.file(filePath);
		passItem.name = this.base(filePath);
		passItem.typeStr = path.extname(filePath).substring(1);
		passItem.comment = '# comment';
		passItem.text = this.passString(passItem);
		passItem.empty = false;
		return passItem;
	}

	passFileName(passName: string): string {
		return passName.concat('.nlp');
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
		visualText.findFilesWithExtension('.nlp');
		this.libraryFileCheck();
		return this.passItems;
	}

	getPassFileUris(topFlag: boolean): vscode.Uri[] {
		let files: vscode.Uri[] = new Array();
		let infolder: boolean = false;
		for (let pass of this.getPasses()) {
			if (topFlag) {
				if (pass.typeStr == 'folder') {
					infolder = true;
				} else if (pass.typeStr == 'end') {
					infolder = false;
				}
			}
			if (!infolder && pass.typeStr == 'nlp' && pass.uri && pass.uri.fsPath.length > 4)
				files.push(pass.uri);
		}
		return files;
	}

	getSequenceFile(): vscode.Uri {
		var uri = visualText.analyzer.getSpecDirectory();
		if (uri.fsPath.length)
			uri = vscode.Uri.file(path.join(visualText.analyzer.getSpecDirectory().fsPath,visualText.ANALYZER_SEQUENCE_FILE));
		return uri;
	}

	getLibraryDirectory(): vscode.Uri {
		return vscode.Uri.file(visualText.getVisualTextDirectory(visualText.ANALYZER_SEQUENCE_FOLDER));
	}

	getSpecDirectory(): vscode.Uri {
		return visualText.analyzer.getSpecDirectory();
	}

	saveType(seqItem: SequenceItem, type: string) {
		var passItem = this.findPass(seqItem.type,seqItem.name);
		if (passItem.exists()) {
			passItem.typeStr = type;
			passItem.active = true;
			this.saveFile();
		}
	}

	saveActive(seqItem: SequenceItem, active: boolean) {
		var passItem = this.findPass(seqItem.type,seqItem.name);
		if (passItem.typeStr == 'folder') {
			var passes: PassItem[] = this.getFolderPasses(passItem.typeStr,passItem.name);
			for (let pass of passes) {
				pass.active = active;
			}
			passItem.active = active;
			this.saveFile();
		}
		else if (passItem.exists()) {
			passItem.active = active;
			this.saveFile();			
		}
	}

	saveFile() {
		this.newcontent = '';
		for (let passItem of this.passItems) {
			if (this.newcontent.length)
				this.newcontent = this.newcontent.concat('\n');
			this.newcontent = this.newcontent.concat(this.passString(passItem));
		}

		fs.writeFileSync(path.join(this.specDir.fsPath,visualText.ANALYZER_SEQUENCE_FILE),this.newcontent,{flag:'w+'});
	}

	movePass(seqItem: SequenceItem, direction: moveDirection) {
		let passItem = this.findPass(seqItem.type, seqItem.name);
		let row = passItem.row;

		if (passItem.isRuleFile()) {
			if (direction == moveDirection.UP) {
				let prev = this.passItems[row-1];			
				this.swapItems(passItem,prev);

			} else {
				let next = this.passItems[row+1];			
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
				let top = passesOne[0].row;
				for (i=0; i<passesOne.length; i++) {
					let pass = this.passItems[top];
					this.moveCount(pass,totalPassCount);
				}

			} else if (direction == moveDirection.UP && prevTop.isFolder()) {
				let passesOne = this.getFolderPasses(prevTop.typeStr,prevTop.name,true);
				let passesTwo = this.getFolderPasses(seqItem.type,seqItem.name,true);
				let totalPassCount = passesOne.length + passesTwo.length - 1;

				let i = 0;
				let top = passesOne[0].row;
				let len = passesOne.length;
				for (i=0; i<len; i++) {
					let pass = this.passItems[top];
					this.moveCount(pass,totalPassCount);
				}

			} else {
				let passes = this.getFolderPasses(seqItem.type,seqItem.name,true);
				if (direction == moveDirection.UP) {
					row--;
				} else {
					passes = passes.reverse();
					row += passes.length;
				}
				let other = this.passItems[row];	
				for (let pass of passes) {
					this.swapItems(other,pass);
					this.saveFile();
					other = pass;
				}					
			}
		}
		this.renumberPasses();
	}

	renumberPasses() {
		let passNum = 1;
		let row = 1;
		for (let passItem of this.passItems) {
			passItem.row = row++;
			if (passItem.isRuleFile())
				passNum++;
			passItem.passNum = passNum;
			const pause = 1;
		}
		this.passItems;
	}

	moveCount(passItem: PassItem, count: number) {
		let i = 0;
		let pass = passItem;
		let next = passItem;
		for (i=passItem.row; i<count+passItem.row; i++ ) {
			next = this.passItems[i+1];
			this.swapItems(pass,next);
			pass = next;
		}
		this.passItems;
	}
	
	prevNLP(passItem: PassItem): PassItem {
		let row = passItem.row;
		let prev = this.passItems[--row];
		while (prev.typeStr.localeCompare('nlp') != 0) {
			prev = this.passItems[--row];
		}
		return prev;
	}

	prevTop(passItem: PassItem): PassItem {
		let row = passItem.row;
		let prev = this.passItems[--row];
		while (prev.inFolder || prev.typeStr.localeCompare('end') == 0) {
			prev = this.passItems[--row];
		}
		return prev;
	}

	nextTop(passItem: PassItem): PassItem {
		let row = passItem.row;
		let next = this.passItems[++row];
		while (next.inFolder) {
			next = this.passItems[++row];
		}
		if (next.typeStr.localeCompare('end') == 0)
			next = this.passItems[++row];
		return next;
	}

	swapItems(itemOne: PassItem, itemTwo: PassItem) {
		var hold = new PassItem();
		this.copyItem(hold,itemOne);
		this.copyItem(itemOne,itemTwo);	
		this.copyItem(itemTwo,hold);
		this.swapAuxFiles(itemOne,itemTwo,nlpFileType.TXXT);
		this.swapAuxFiles(itemOne,itemTwo,nlpFileType.KBB);
	}

	copyItem(toItem: PassItem, fromItem: PassItem) {
		toItem.text = fromItem.text;
		toItem.name = fromItem.name;
		toItem.tokenizer = fromItem.tokenizer;
		toItem.typeStr = fromItem.typeStr;
		toItem.inFolder = fromItem.inFolder;
		toItem.uri = fromItem.uri;
		toItem.comment = fromItem.comment;
		toItem.active = fromItem.active;
	}

	swapAuxFiles(itemOne: PassItem, itemTwo: PassItem, type: nlpFileType) {
		var logFile = new TreeFile();
		var oneFile = logFile.anaFile(itemOne.passNum,type).fsPath;
		var swapFile = oneFile + ".swap";
		var twoFile = logFile.anaFile(itemTwo.passNum,type).fsPath;
		var oneExists = fs.existsSync(oneFile);
		var twoExists = fs.existsSync(twoFile);

		if (oneExists && twoExists) {
			fs.copyFileSync(oneFile,swapFile);
			fs.copyFileSync(twoFile,oneFile);
			fs.copyFileSync(swapFile,twoFile);
			dirfuncs.delFile(swapFile);				
		} else if (oneExists) {
			dirfuncs.rename(oneFile,twoFile);
		} else if (twoExists) {
			dirfuncs.rename(twoFile,oneFile);
		}
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

	findPassFromUri(filepath: string): PassItem {
		var found = false;
		for (let passItem of this.passItems) {
			if (filepath == 'tokenizer pass' || filepath == passItem.uri.fsPath) {
				return passItem;
			}
		}
		return new PassItem();
	}

	choicePasses(specDir: string, items: vscode.QuickPickItem[], indent: string='', includeTokFlag: boolean=true) {
		this.setSpecDir(specDir);
		this.getPassFiles(specDir);
		for (let pass of this.getPassItems()) {
			if (pass.typeStr.localeCompare('folder')) {
				if (pass.tokenizer && includeTokFlag) {
					items.push({label: pass.typeStr, description: 'tokenizer pass'});
				} else {
					let uri = this.passItemUri(pass);
					if (fs.existsSync(uri.fsPath))
						items.push({label: indent + path.basename(uri.fsPath), description: uri.fsPath});				
				}
			}
		}
	}

	choiceRulePasses(specDir: string, items: vscode.QuickPickItem[]) {
		this.setSpecDir(specDir);
		this.getPassFiles(specDir);
		const nlp = new NLPFile();
		for (let pass of this.getPassItems()) {
			const contextLine = nlp.getContextLine(pass.uri);
			if (contextLine.length) {
				items.push({label: path.basename(pass.uri.fsPath), description: pass.uri.fsPath});				
			}
		}
	}

	public getSisterFiles(filePath: string): vscode.QuickPickItem[] {
		let items: vscode.QuickPickItem[] = [];
		let name = path.basename(filePath);
		let tokens = name.split('_');
		if (tokens.length > 1) {
			name = tokens[0];
		}
		for (let item of visualText.analyzer.seqFile.getPassItems()) {
			if (!(item.name === name) && item.name.startsWith(name))
				items.push({label: path.basename(item.uri.fsPath), description: item.uri.fsPath});	
		}
		return items;
	}

	public hasSisterFile(filename: string): boolean {
		const seqItems = this.getPassItems();
		for (let item of seqItems) {
			const base = item.name;
			if (!(base === filename) && (this.compareSisters(base,filename) || this.compareSisters(filename,base)))
				return true;
		}
		return false;
	}

	compareSisters(filename1: string, filename2: string): boolean {
		return filename2.length > filename1.length && filename2.startsWith(filename1 + "_");
	}

	public getLibraryFile(filepath: string): string {
		let name = path.basename(filepath);
		let count = visualText.getLibraryFiles().length;
		for (let file of visualText.getLibraryFiles()) {
			let base = path.basename(file);
			if (base === name) {
				return file;
			}
		}
		return "";
	}
}
