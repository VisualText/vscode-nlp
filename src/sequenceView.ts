import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { moveDirection } from './sequence';
import { TextFile, nlpFileType } from './textFile';
import { LogFile } from './logfile';
import { FindFile } from './findFile';
import { findView } from './findView';
import { dirfuncs } from './dirfuncs';

interface SequenceItem {
	uri: vscode.Uri;
	label: string;
	name: string;
	passNum: number;
	type: string;
}

export class PassTree implements vscode.TreeDataProvider<SequenceItem> {
	
	private _onDidChangeTreeData: vscode.EventEmitter<SequenceItem> = new vscode.EventEmitter<SequenceItem>();
	readonly onDidChangeTreeData: vscode.Event<SequenceItem> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	async getChildren(element?: SequenceItem): Promise<SequenceItem[]> {
		if (element) {
			return [];
		}

		if (visualText.hasWorkspaceFolder() && visualText.hasAnalyzers()) {
			visualText.analyzer.seqFile.init();
			var seqFile = visualText.analyzer.seqFile;
			const seqItems = new Array();

			for (let passItem of seqFile.getPasses()) {
				var label = passItem.num.toString() + ' ' + passItem.name;
				if (passItem.isRuleFile()) {
					if (passItem.fileExists())
						seqItems.push({uri: passItem.uri, label: label, name: passItem.name, tooltip: passItem.uri.path, contextValue: 'file', type: passItem.typeStr, passNum: passItem.num, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
					else
						seqItems.push({label: label, name: passItem.name, tooltip: 'MISSING', contextValue: 'missing', type: 'missing', passNum: passItem.num, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
				} else {
					if (passItem.typeStr.localeCompare('tokenize') == 0)
						label = '1 tokenize';
					seqItems.push({label: label, name: passItem.name, tooltip: passItem.uri.path, contextValue: 'stub', type: passItem.typeStr, passNum: passItem.num, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
				}			
			}
			return seqItems;
		}

		return [];
	}

	getTreeItem(seqItem: SequenceItem): vscode.TreeItem {
		if (seqItem.type.localeCompare('pat') == 0) {
			return {
				resourceUri: seqItem.uri,
				label: seqItem.label,
				contextValue: 'file',
				collapsibleState: vscode.TreeItemCollapsibleState.None,
				command: { command: 'sequenceView.openFile', title: "Open File", arguments: [seqItem] },
				iconPath: {
					light: path.join(__filename, '..', '..', 'fileicons', 'images', 'light', 'dna.svg'),
					dark: path.join(__filename, '..', '..', 'fileicons', 'images', 'dark', 'dna.svg')
				}
			}
		} else {
			return {
				resourceUri: seqItem.uri,
				label: seqItem.label,
				contextValue: 'stub',
				collapsibleState: vscode.TreeItemCollapsibleState.None,
				iconPath: {
					light: path.join(__filename, '..', '..', 'fileicons', 'images', 'light', 'seq-circle.svg'),
					dark: path.join(__filename, '..', '..', 'fileicons', 'images', 'dark', 'seq-circle.svg')
				}
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
			var row = seqFile.findPass(seqItem.name);

			// Build new file
			if (row == 0) {
				vscode.window.showWarningMessage('Tokenize must be first');
			} else if (row == 1 && direction == moveDirection.UP) {
				vscode.window.showWarningMessage('Cannot move into the first position');

			} else if (row >= 1 && row + 1 < seqFile.getPasses().length) {
				seqFile.movePass(direction,row);
				seqFile.saveFile();
				this.refresh();	

			} else if (row == -1) {
				vscode.window.showWarningMessage('Item cannot move up');
			} else {
				vscode.window.showWarningMessage('Item cannot move down');				
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
				if (seqItem.type.localeCompare('missing')) {
					seqFile.deletePassInSeqFile(seqItem.name);
				} else {
					seqFile.setFile(seqItem.uri);
					if (!selection || selection.label == 'No')
						return;
					seqFile.deletePass(seqItem.uri);
					this.refresh();					
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
				var newfile: vscode.Uri = vscode.Uri.file(selection[0].path);
				seqFile.insertPass(seqItem.uri,newfile);
				this.refresh();
			});			
		}
	}
	
	insertNewPass(seqItem: SequenceItem): void {
		if (visualText.hasWorkspaceFolder()) {
			var seqFile = visualText.analyzer.seqFile;
			vscode.window.showInputBox({ value: 'newpass', prompt: 'Enter new pass name' }).then(newname => {
				if (newname) {
					if (seqItem && seqItem.uri)
						seqFile.insertNewPass(seqItem.uri,newname);
					else
						seqFile.insertNewPassEnd(newname);
					this.refresh();
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
					seqFile.renamePass(seqItem.name,newname);
					var newfile = vscode.Uri.file(path.join(seqFile.getSpecDirectory().path,newname.concat(path.extname(original.path))));
					dirfuncs.renameFile(original.path,newfile.path);
					this.refresh();
				}
			});
		}
	}
}

export let sequenceView: SequenceView;
export class SequenceView {

	private sequenceView: vscode.TreeView<SequenceItem>;
	workspacefolder: vscode.WorkspaceFolder | undefined;
	private textFile = new TextFile();
	private logFile = new LogFile();
	private findFile = new FindFile();

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new PassTree();
		this.sequenceView = vscode.window.createTreeView('sequenceView', { treeDataProvider });
		vscode.commands.registerCommand('sequenceView.openFile', (seqItem) => this.openNLP(seqItem));
		vscode.commands.registerCommand('sequenceView.openTree', (seqItem) => this.openTree(seqItem));
		vscode.commands.registerCommand('sequenceView.openHighlight', (seqItem) => this.openHighlight(seqItem));
		vscode.commands.registerCommand('sequenceView.openKB', (seqItem) => this.openKB(seqItem));
		vscode.commands.registerCommand('sequenceView.search', () => this.search());
		vscode.commands.registerCommand('sequenceView.moveUp', (seqItem) => treeDataProvider.moveUp(seqItem));
		vscode.commands.registerCommand('sequenceView.moveDown', (seqItem) => treeDataProvider.moveDown(seqItem));
		vscode.commands.registerCommand('sequenceView.refreshAll', () => treeDataProvider.refresh());
		vscode.commands.registerCommand('sequenceView.insert', (seqItem) => treeDataProvider.insertPass(seqItem));
		vscode.commands.registerCommand('sequenceView.insertNew', (seqItem) => treeDataProvider.insertNewPass(seqItem));
		vscode.commands.registerCommand('sequenceView.delete', (seqItem) => treeDataProvider.deletePass(seqItem));
		vscode.commands.registerCommand('sequenceView.rename', (seqItem) => treeDataProvider.renamePass(seqItem));
	}

    static attach(ctx: vscode.ExtensionContext) {
        if (!sequenceView) {
            sequenceView = new SequenceView(ctx);
        }
        return sequenceView;
	}
	
	search() {
		if (visualText.hasWorkspaceFolder()) {
			if (visualText.hasWorkspaceFolder()) {
				vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
					if (searchWord) {
						this.findFile.searchFiles(visualText.analyzer.getSpecDirectory(),searchWord,'.pat');
						findView.loadFinds(searchWord,this.findFile.getMatches());
						vscode.commands.executeCommand('findView.refreshAll');
						vscode.commands.executeCommand('findView.updateTitle');
					}
				});
			}
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
		if (this.notMissing(seqItem)) {
			this.textFile.setFile(seqItem.uri);
			if (!this.textFile.isFileType(nlpFileType.NLP)) {
				vscode.window.showWarningMessage('Not editable');
				return;
			}
			visualText.analyzer.saveCurrentPass(seqItem.uri);
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
			if (fs.existsSync(visualText.analyzer.getOutputDirectory().path)) {
				var logfile = this.logFile.anaFile(seqItem.passNum,nlpFileType.TREE);
				if (fs.existsSync(logfile.path))
					vscode.window.showTextDocument(logfile);
				else
					vscode.window.showWarningMessage('No tree file ' + path.basename(logfile.path));
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
			if (fs.existsSync(visualText.analyzer.getOutputDirectory().path)) {
				var firefile = this.logFile.firedFile(seqItem.passNum);
				if (fs.existsSync(firefile.path))
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
			if (fs.existsSync(visualText.analyzer.getOutputDirectory().path)) {
				var kbfile = this.logFile.anaFile(seqItem.passNum,nlpFileType.KB);
				if (fs.existsSync(kbfile.path))
					vscode.window.showTextDocument(kbfile);
				else
					vscode.window.showWarningMessage('No KB file for this pass');
			}
		}
	}
}