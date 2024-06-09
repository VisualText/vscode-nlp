import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SequenceItem } from './sequenceView';
import { TextFile, nlpFileType } from './textFile';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';
import { TreeFile } from './treeFile';

export enum moveDirection { UP, DOWN }
export enum newPassType { RULES, CODE, DECL }

export class PassItem {
	public uri = vscode.Uri.file('');
	public text: string = '';
	public name: string = '';
	public comment: string = '';
	public passNum: number = 0;
	public order: number = 0;
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
		this.order = 0;
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

	public setAnalyzerDirectory(analyzerDir: string) {
		const specDir = path.join(analyzerDir,'spec');
		this.setSpecDir(specDir);
		this.getPassFiles(this.specDir.fsPath);
	}

	public setSpecDir(specDir: string) {
		this.specDir = vscode.Uri.file(specDir);
	}

	public getPassFiles(specDir: string) {
		super.setFile(vscode.Uri.file(path.join(specDir,visualText.ANALYZER_SEQUENCE_FILE)),true);
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
			} else if (passItem.exists())
				passNum++;

			if (passItem.text.length) {
				passItem.order = order++;
				this.passItems.push(passItem);
			}
		}
	}

	public getPassItems() {
		return this.passItems;
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
		return passes.length + passItem.order == this.passCount();
	}

	insertFolder(passafter: vscode.Uri) {
		if (passafter.fsPath.length > 1) {
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

	inFolder(passItem: PassItem): boolean {
		var passes = this.getPasses();
		var order = passes[passItem.order].order;
		while (order) {
			order--;
			var currentPass = passes[order];
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
			this.passItems.splice(passItem.passNum,0,dupeItem);
			this.saveFile();
		}
	}
	
	insertPass(row: number, newpass: vscode.Uri) {
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
				for (let pass of passes) {
					var passPath = path.join(specDir,path.basename(pass.fsPath));
					if (copy) {
						fs.copyFileSync(pass.fsPath,passPath);								
					}		
					var passItem = this.createPassItemFromFile(passPath);
					this.passItems.splice(row,0,passItem);
					row++;
				}
				this.saveFile();			
			}
		}	
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
				this.passItems.splice(foundItem.order+1,0,passItem);
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

	insertNewFolder(seqItem: SequenceItem, newFolder: string) {
		if (this.passItems.length && newFolder.length) {
			var foundItem = this.findPass(seqItem.type,seqItem.name);
			if (foundItem) {
				var passItem = this.createPassItemFolder('end',newFolder);
				this.passItems.splice(foundItem.order+1,0,passItem);
				passItem = this.createPassItemFolder('folder',newFolder);
				this.passItems.splice(foundItem.order+1,0,passItem);
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

	deleteFolder(passItem: PassItem, foldersOnly: boolean=false) {
		let passes = this.getFolderPasses(passItem.typeStr,passItem.name,true);
		if (foldersOnly) {
			let len = passes.length;
			let first = passes[0];
			let last = passes[len-1];
			this.deletePassInSeqFile(last.typeStr,last.name);
			this.deletePassInSeqFile(first.typeStr,first.name);
		} else {
			this.passItems.splice(passes[0].order,passes.length);
		}
	}

	deletePassInSeqFile(type: string, name: string) {
		var passItem = this.findPass(type, name);
		if (passItem) {
			this.passItems.splice(passItem.order,1);
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
		return vscode.Uri.file(visualText.getVisualTextDirectory('spec'));
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
				if (direction == moveDirection.UP) {
					order--;
				} else {
					passes = passes.reverse();
					order += passes.length;
				}
				let other = this.passItems[order];	
				for (let pass of passes) {
					this.swapItems(other,pass);
					this.saveFile();
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
		this.swapAuxFiles(itemOne,itemTwo,nlpFileType.TXXT);
		this.swapAuxFiles(itemOne,itemTwo,nlpFileType.KBB);
	}

	copyItem(toItem: PassItem, fromItem: PassItem) {
		toItem.text = fromItem.text;
		toItem.name = fromItem.name;
		toItem.passNum = fromItem.passNum;
		toItem.order = fromItem.order;
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