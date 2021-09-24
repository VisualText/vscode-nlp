import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { PassItem, moveDirection } from './sequence';
import { TextFile, nlpFileType } from './textFile';
import { LogFile } from './logfile';
import { FindFile } from './findFile';
import { findView } from './findView';
import { dirfuncs } from './dirfuncs';

export interface SequenceItem extends vscode.TreeItem {
	uri: vscode.Uri;
	label: string;
	name: string;
	passNum: number;
	order: number;
	type: string;
	active: boolean;
	inFolder: boolean;
}

export class PassTree implements vscode.TreeDataProvider<SequenceItem> {
	
	private _onDidChangeTreeData: vscode.EventEmitter<SequenceItem> = new vscode.EventEmitter<SequenceItem>();
	readonly onDidChangeTreeData: vscode.Event<SequenceItem> = this._onDidChangeTreeData.event;

	refresh(seqItem: SequenceItem): void {
		this._onDidChangeTreeData.fire(seqItem);
	}

	constructor() {
	}

	async getChildren(seqItem?: SequenceItem): Promise<SequenceItem[]> {
		var seqFile = visualText.analyzer.seqFile;
		if (seqItem) {
			return this.getPasses(seqFile.getFolderPasses(seqItem.type,seqItem.name));
		}

		if (visualText.hasWorkspaceFolder() && visualText.hasAnalyzers()) {
			seqFile.init();
			return this.getPasses(seqFile.getPasses());
		}

		return [];
	}

	getPasses(passes: PassItem[]): SequenceItem[] {
		var folder = '';
		const seqItems = new Array();
		const logFile = new LogFile();
		const textFile = new TextFile();
		var collapse = vscode.TreeItemCollapsibleState.None;
		var order = 0;

		var hasPat: Boolean = dirfuncs.getFiles(visualText.analyzer.getSpecDirectory(),['.pat']).length ? true : false;
		vscode.commands.executeCommand('setContext', 'myExtension.hasPat', hasPat);

		for (let passItem of passes) {
			var label = passItem.passNum.toString() + ' ' + passItem.name;

			if (passItem.isFolder()) {
				folder = passItem.name;
				label = passItem.name;
				seqItems.push({label: label, name: passItem.name, tooltip: passItem.uri.fsPath, contextValue: 'folder', inFolder: passItem.inFolder,
					type: passItem.typeStr, passNum: passItem.passNum, order: order, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
			
			} else if (folder.length) {
				if (passItem.isEnd(folder))
					folder = '';
			
			} else if (passItem.isRuleFile()) {
				var logPath = logFile.anaFile(passItem.passNum,nlpFileType.TREE);
				var conVal = '';
				if (logFile.hasLogFileType(passItem.uri,passItem.passNum,nlpFileType.TREE))
					conVal = 'hasLog';
				if (logFile.hasLogFileType(passItem.uri,passItem.passNum,nlpFileType.KBB))
					conVal = conVal + 'hasKB';
				if (conVal.length == 0)
					conVal = 'file';
				if (passItem.fileExists())
					seqItems.push({uri: passItem.uri, label: label, name: passItem.name, tooltip: passItem.uri.fsPath, contextValue: conVal,
						inFolder: passItem.inFolder, type: passItem.typeStr, passNum: passItem.passNum, order: order, collapsibleState: collapse, active: passItem.active});
				else
					seqItems.push({label: label, name: passItem.name, tooltip: 'MISSING', contextValue: 'missing', inFolder: passItem.inFolder,
						type: 'missing', passNum: passItem.passNum, order: order, collapsibleState: collapse, active: passItem.active});
			
			} else {
				if (passItem.tokenizer) {
					label = '1 ' + passItem.typeStr;
					conVal = 'tokenize';
				} else {
					label = passItem.name;
					conVal = 'stub';
				}
				seqItems.push({label: label, name: passItem.name, tooltip: passItem.uri.fsPath, contextValue: conVal, inFolder: passItem.inFolder,
					type: passItem.typeStr, passNum: passItem.passNum, order: order, collapsibleState: collapse, active: passItem.active});
			}
			order++;	
		}

		return seqItems;
	}

	getTreeItem(seqItem: SequenceItem): vscode.TreeItem {
		var icon = seqItem.active ? 'dna.svg' : 'dna-grayed.svg';
		var collapse = vscode.TreeItemCollapsibleState.None;

		if (seqItem.type.localeCompare('rec') == 0) {
			icon = seqItem.active ? 'dnar.svg' : 'dnar-grayed.svg';

		} else if (seqItem.type.localeCompare('folder') == 0) {
			icon = 'folder.svg';
			collapse = vscode.TreeItemCollapsibleState.Collapsed;

		} else if (seqItem.type.localeCompare('nlp')) {
			icon = 'seq-circle.svg';
		}

		return {
			resourceUri: seqItem.uri,
			label: seqItem.label,
			contextValue: seqItem.contextValue,
			collapsibleState: collapse,
			iconPath: {
				light: path.join(__filename, '..', '..', 'resources', 'light', icon),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', icon)
			},
			command: {
				command: 'sequenceView.openFile',
				arguments: [seqItem],
				title: 'Open Pass'
			}
		}
	}

	moveUp(seqItem: SequenceItem): void {
		this.moveSequence(seqItem,moveDirection.UP);
	}

	moveDown(seqItem: SequenceItem): void {
		this.moveSequence(seqItem,moveDirection.DOWN);
	}
	
	moveSequence(seqItem: SequenceItem, direction: moveDirection) {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			var passItem = seqFile.findPass(seqItem.type,seqItem.name);
			var order = passItem.order;

			if (seqItem.type.localeCompare('tokenize') == 0 || seqItem.type.localeCompare('dicttokz') == 0) {
				vscode.window.showWarningMessage('Cannot move the tokenizer');

			} else if (order == 1 && direction == moveDirection.UP) {
				vscode.window.showWarningMessage('Tokenizer must be first');

			} else if (order == 0 && direction == moveDirection.UP) {
				vscode.window.showWarningMessage('Item cannot move up');

			} else if (seqItem.type.localeCompare('folder') == 0 && direction == moveDirection.DOWN && seqFile.atBottom(passItem)) {
				vscode.window.showWarningMessage('Item cannot move down');

			} else if (order + 1 == seqFile.passCount() && direction == moveDirection.DOWN) {
				vscode.window.showWarningMessage('Item cannot move down');

			} else {
				seqFile.movePass(seqItem,direction);
				seqFile.saveFile();
				vscode.commands.executeCommand('sequenceView.refreshAll');
			}
		}
	}

	deletePass(seqItem: SequenceItem): void {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',seqItem.name,'\' pass');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete pass'});

			vscode.window.showQuickPick(items).then(selection => {
				if (seqItem.type.localeCompare('missing') == 0) {
					seqFile.deletePassInSeqFile(seqItem.type, seqItem.name);
				} else {
					if (!selection || selection.label == 'No')
						return;
					seqFile.deletePass(seqItem);
					this.refresh(seqItem);					
				}
				vscode.commands.executeCommand('sequenceView.refreshAll');
			});
		}
	}

	insertLibraryPass(seqItem: SequenceItem): void {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			const options: vscode.OpenDialogOptions = {
				canSelectMany: true,
				openLabel: 'Open',
				defaultUri: seqFile.getLibraryDirectory(),
				canSelectFiles: true,
				canSelectFolders: false,
				filters: {
					'Text files': ['pat','nlp'],
					'All files': ['*']
				}
			};
			vscode.window.showOpenDialog(options).then(selection => {
				if (!selection) {
					return;
				}
				for (let select of selection.reverse()) {
					var newfile: vscode.Uri = vscode.Uri.file(select.fsPath);
					seqFile.insertPass(seqItem,newfile);
				}
				vscode.commands.executeCommand('sequenceView.refreshAll');
			});			
		}
	}

	insertPass(seqItem: SequenceItem): void {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Open',
				defaultUri: seqFile.getSpecDirectory(),
				filters: {
					'Text files': ['pat','nlp'],
					'All files': ['*']
				}
			};
			vscode.window.showOpenDialog(options).then(selection => {
				if (!selection) {
					return;
				}
				for (let select of selection.reverse()) {
					var newfile: vscode.Uri = vscode.Uri.file(select.fsPath);
					seqFile.insertPass(seqItem,newfile);
				}
				vscode.commands.executeCommand('sequenceView.refreshAll');
			});			
		}
	}
	
	insertNewPass(seqItem: SequenceItem): void {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			vscode.window.showInputBox({ value: 'newpass', prompt: 'Enter new pass name' }).then(newname => {
				if (newname) {
					if (seqItem && (seqItem.uri || seqFile.getPasses().length > 1))
						seqFile.insertNewPass(seqItem,newname);
					else
						seqFile.insertNewPassEnd(newname);
					vscode.commands.executeCommand('sequenceView.refreshAll');
				}
			});
		}
	}
	
	renamePass(seqItem: SequenceItem): void {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			vscode.window.showInputBox({ value: seqItem.name, prompt: 'Enter new name for pass' }).then(newname => {
				var original = seqItem.uri;
				if (newname) {
					seqFile.renamePass(seqItem,newname);
					if (seqItem.type.localeCompare('nlp') == 0 || seqItem.type.localeCompare('rec') == 0) {
						var newfile = vscode.Uri.file(path.join(seqFile.getSpecDirectory().fsPath,newname.concat(path.extname(original.fsPath))));
						dirfuncs.rename(original.fsPath,newfile.fsPath);						
					}
					vscode.commands.executeCommand('sequenceView.refreshAll');
				}
			});
		}
	}

	duplicatePass(seqItem: SequenceItem): void {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			var seedName = seqItem.name + '1';
			vscode.window.showInputBox({ value: seedName, prompt: 'Enter name for duplicate pass' }).then(newname => {
				var original = seqItem.uri;
				if (newname) {
					seqFile.duplicatePass(seqItem,newname);
					vscode.commands.executeCommand('sequenceView.refreshAll');
				}
			});
		}
	}

	newFolder(seqItem: SequenceItem) {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			vscode.window.showInputBox({ value: 'newpass', prompt: 'Enter new folder name' }).then(newname => {
				if (newname) {
					if (seqItem && seqItem.uri)
						seqFile.insertNewFolder(seqItem,newname);
					else
						seqFile.insertNewFolderEnd(newname);
					vscode.commands.executeCommand('sequenceView.refreshAll');
				}
			});
		}		
	}

	typeRec(seqItem: SequenceItem) {
		visualText.analyzer.seqFile.saveType(seqItem.passNum,'rec');
		vscode.commands.executeCommand('sequenceView.refreshAll');
	}
	
	typeOn(seqItem: SequenceItem) {
		visualText.analyzer.seqFile.saveActive(seqItem.passNum,true);
		vscode.commands.executeCommand('sequenceView.refreshAll');
	}
	
	typeOff(seqItem: SequenceItem) {
		visualText.analyzer.seqFile.saveActive(seqItem.passNum,false);
		vscode.commands.executeCommand('sequenceView.refreshAll');
	}

	tokenize(seqItem: SequenceItem) {
		this.renameToken(seqItem,'tokenize');
	}

	dicttok(seqItem: SequenceItem) {
		this.renameToken(seqItem,'dicttok');
	}

	dicttokz(seqItem: SequenceItem) {
		this.renameToken(seqItem,'dicttokz');
	}

	cmltok(seqItem: SequenceItem) {
		this.renameToken(seqItem,'cmltok');
	}

	renameToken(seqItem: SequenceItem, newname: string) {
		visualText.analyzer.seqFile.saveType(seqItem.passNum,newname);
		vscode.commands.executeCommand('sequenceView.refreshAll');
	}
}

export let sequenceView: SequenceView;
export class SequenceView {

	private sequenceView: vscode.TreeView<SequenceItem>;
	workspacefolder: vscode.WorkspaceFolder | undefined;
	private textFile = new TextFile();
	private logFile = new LogFile();
	private findFile = new FindFile();

    static attach(ctx: vscode.ExtensionContext) {
        if (!sequenceView) {
            sequenceView = new SequenceView(ctx);
        }
        return sequenceView;
	}
	
	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new PassTree();

		this.sequenceView = vscode.window.createTreeView('sequenceView', { treeDataProvider });
		vscode.commands.registerCommand('sequenceView.openFile', (seqItem) => this.openNLP(seqItem));
		vscode.commands.registerCommand('sequenceView.openTree', (seqItem) => this.openTree(seqItem));
		vscode.commands.registerCommand('sequenceView.openHighlight', (seqItem) => this.openHighlight(seqItem));
		vscode.commands.registerCommand('sequenceView.openKB', (seqItem) => this.openKB(seqItem));
		vscode.commands.registerCommand('sequenceView.search', () => this.search());
		vscode.commands.registerCommand('sequenceView.finalTree', () => this.finalTree());
		vscode.commands.registerCommand('sequenceView.convert', () => this.convertPatToNLP());

		vscode.commands.registerCommand('sequenceView.moveUp', (seqItem) => treeDataProvider.moveUp(seqItem));
		vscode.commands.registerCommand('sequenceView.moveDown', (seqItem) => treeDataProvider.moveDown(seqItem));
		vscode.commands.registerCommand('sequenceView.refreshAll', (seqItem) => treeDataProvider.refresh(seqItem));
		vscode.commands.registerCommand('sequenceView.insert', (seqItem) => treeDataProvider.insertPass(seqItem));
		vscode.commands.registerCommand('sequenceView.insertNew', (seqItem) => treeDataProvider.insertNewPass(seqItem));
		vscode.commands.registerCommand('sequenceView.insertLibrary', (seqItem) => treeDataProvider.insertLibraryPass(seqItem));
		vscode.commands.registerCommand('sequenceView.delete', (seqItem) => treeDataProvider.deletePass(seqItem));
		vscode.commands.registerCommand('sequenceView.duplicate', (seqItem) => treeDataProvider.duplicatePass(seqItem));
		vscode.commands.registerCommand('sequenceView.rename', (seqItem) => treeDataProvider.renamePass(seqItem));
		vscode.commands.registerCommand('sequenceView.typeRec', (seqItem) => treeDataProvider.typeRec(seqItem));
		vscode.commands.registerCommand('sequenceView.typeOff', (seqItem) => treeDataProvider.typeOff(seqItem));
		vscode.commands.registerCommand('sequenceView.typeOn', (seqItem) => treeDataProvider.typeOn(seqItem));
		vscode.commands.registerCommand('sequenceView.newFolder', (seqItem) => treeDataProvider.newFolder(seqItem));
		vscode.commands.registerCommand('sequenceView.tokenize', (seqItem) => treeDataProvider.tokenize(seqItem));
		vscode.commands.registerCommand('sequenceView.dicttok', (seqItem) => treeDataProvider.dicttok(seqItem));
		vscode.commands.registerCommand('sequenceView.dicttokz', (seqItem) => treeDataProvider.dicttokz(seqItem));
		vscode.commands.registerCommand('sequenceView.cmltok', (seqItem) => treeDataProvider.cmltok(seqItem));
	}

	convertPatToNLP() {
		visualText.analyzer.seqFile.convertPatFiles();
		vscode.commands.executeCommand('sequenceView.refreshAll');
	}

	finalTree() {
		var dir = visualText.analyzer.getOutputDirectory();
		var finalTree = path.join(dir.fsPath,'final.tree');
		if (fs.existsSync(finalTree)) {
			vscode.window.showTextDocument(vscode.Uri.file(finalTree));	
		} else {
			vscode.window.showInformationMessage('No final tree found');
		}
	}

	public search(word: string='') {
		if (visualText.hasWorkspaceFolder()) {
			if (word.length == 0) {
				vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
					if (searchWord?.length)
						this.findWord(searchWord);
				});				
			} else {
				this.findWord(word);
			}
		}
	}

	private findWord(word: string) {
		if (word.length) {
			this.findFile.searchFiles(visualText.analyzer.getSpecDirectory(),word,['.nlp','.pat']);
			findView.loadFinds(word,this.findFile.getMatches());
			vscode.commands.executeCommand('findView.refreshAll');
			vscode.commands.executeCommand('findView.updateTitle');
		}
	}

	private notMissing(seqItem: SequenceItem): boolean {
		if (seqItem.type.localeCompare('missing') == 0) {
			vscode.window.showInformationMessage('File is missing: ' + seqItem.name);
			return false;
		}
		return true;
	}

	private openNLP(seqItem: SequenceItem): void {
		if (this.notMissing(seqItem) && seqItem.type.localeCompare('folder') && seqItem.type.localeCompare('stub')) {
			this.textFile.setFile(seqItem.uri);
			if (!this.textFile.isFileType(nlpFileType.NLP)) {
				vscode.window.showWarningMessage('Not editable');
				return;
			}
			visualText.analyzer.saveCurrentPass(seqItem.uri, seqItem.passNum);
			vscode.window.showTextDocument(seqItem.uri);			
		}
	}
	
	private openTree(seqItem: SequenceItem): void {
		if (this.notMissing(seqItem)) {
			this.textFile.setFile(seqItem.uri);
			if (!this.textFile.isFileType(nlpFileType.NLP)) {
				vscode.window.showWarningMessage('Not editable');
				return;
			}
			if (fs.existsSync(visualText.analyzer.getOutputDirectory().fsPath)) {
				var logfile = this.logFile.anaFile(seqItem.passNum,nlpFileType.TREE);
				if (fs.existsSync(logfile.fsPath))
					vscode.window.showTextDocument(logfile);
				else
					vscode.window.showWarningMessage('No tree file ' + path.basename(logfile.fsPath));
			}
		}
	}

	private openHighlight(seqItem: SequenceItem): void {
		if (this.notMissing(seqItem)) {
			this.textFile.setFile(seqItem.uri);
			if (!this.textFile.isFileType(nlpFileType.NLP)) {
				vscode.window.showWarningMessage('Not editable');
				return;
			}
			if (fs.existsSync(visualText.analyzer.getOutputDirectory().fsPath)) {
				var firefile = this.logFile.firedFile(seqItem.passNum);
				if (fs.existsSync(firefile.fsPath))
					vscode.window.showTextDocument(firefile);
				else
					vscode.window.showWarningMessage('No highlight file with this pass');
			}
		}
	}

	private openKB(seqItem: SequenceItem): void {
		if (this.notMissing(seqItem)) {
			this.textFile.setFile(seqItem.uri);
			if (!this.textFile.isFileType(nlpFileType.NLP)) {
				vscode.window.showWarningMessage('Not editable');
				return;
			}
			if (fs.existsSync(visualText.analyzer.getOutputDirectory().fsPath)) {
				var kbfile = this.logFile.anaFile(seqItem.passNum,nlpFileType.KBB);
				if (fs.existsSync(kbfile.fsPath))
					vscode.window.showTextDocument(kbfile);
				else
					vscode.window.showWarningMessage('No KB file for this pass');
			}
		}
	}
}