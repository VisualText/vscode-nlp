import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { seqType, moveDirection } from './sequence';
import { TextFile, nlpFileType } from './textFile';
import { LogFile } from './logfile';
import { FindFile } from './findFile';
import { findView } from './findView';
import { FileStat, _ } from './fileExplorer';


interface SequenceItem {
	uri: vscode.Uri;
	label: string;
	name: string;
	passNum: number;
	type: seqType;
}

/*
class SequenceItem extends vscode.TreeItem {
	constructor(
		public readonly uri: vscode.Uri,
		public readonly label: string,
		public readonly contextValue: string,
		public pass: number,
		public type: seqType,
		public collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(label, collapsibleState);
		this.command = { command: 'analayzerSequence.openFile', title: "Open File", arguments: [this.uri] };
	}
}
*/

export class PassTree implements vscode.TreeDataProvider<SequenceItem>, vscode.FileSystemProvider {

	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	
	private _onDidChangeTreeData: vscode.EventEmitter<SequenceItem> = new vscode.EventEmitter<SequenceItem>();
	readonly onDidChangeTreeData: vscode.Event<SequenceItem> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() {
		this._onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	}

	get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
		return this._onDidChangeFile.event;
	}

	watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
		const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event: string, filename: string | Buffer) => {
			const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));

			// TODO support excludes (using minimatch library?)

			this._onDidChangeFile.fire([{
				type: event === 'change' ? vscode.FileChangeType.Changed : await _.exists(filepath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
				uri: uri.with({ path: filepath })
			} as vscode.FileChangeEvent]);
		});

		return { dispose: () => watcher.close() };
	}

	stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
		return this._stat(uri.fsPath);
	}

	async _stat(path: string): Promise<vscode.FileStat> {
		return new FileStat(await _.stat(path));
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
		return this._readDirectory(uri);
	}

	async _readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const children = await _.readdir(uri.fsPath);

		const result: [string, vscode.FileType][] = [];
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			const stat = await this._stat(path.join(uri.fsPath, child));
			result.push([child, stat.type]);
		}

		return Promise.resolve(result);
	}

	createDirectory(uri: vscode.Uri): void | Thenable<void> {
		return _.mkdir(uri.fsPath);
	}

	readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
		return _.readfile(uri.fsPath);
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
		return this._writeFile(uri, content, options);
	}

	async _writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(uri.fsPath);
		if (!exists) {
			if (!options.create) {
				throw vscode.FileSystemError.FileNotFound();
			}

			await _.mkdir(path.dirname(uri.fsPath));
		} else {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			}
		}

		return _.writefile(uri.fsPath, content as Buffer);
	}

	delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
		if (options.recursive) {
			return _.rmrf(uri.fsPath);
		}

		return _.unlink(uri.fsPath);
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
		return this._rename(oldUri, newUri, options);
	}

	async _rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): Promise<void> {
		const exists = await _.exists(newUri.fsPath);
		if (exists) {
			if (!options.overwrite) {
				throw vscode.FileSystemError.FileExists();
			} else {
				await _.rmrf(newUri.fsPath);
			}
		}

		const parentExists = await _.exists(path.dirname(newUri.fsPath));
		if (!parentExists) {
			await _.mkdir(path.dirname(newUri.fsPath));
		}

		return _.rename(oldUri.fsPath, newUri.fsPath);
	}

	// tree data provider

	async getChildren(element?: SequenceItem): Promise<SequenceItem[]> {
		if (element) {
			return [];
		}

		if (visualText.hasWorkspaceFolder()) {
			visualText.analyzer.seqFile.init();
			var specDir = visualText.analyzer.getSpecDirectory();
			const children = await this.readDirectory(specDir);
			children.sort((a, b) => {
				if (a[1] === b[1]) {
					return a[0].localeCompare(b[0]);
				}
				return a[1] === vscode.FileType.Directory ? -1 : 1;
			});
			const chittlins = children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(specDir.fsPath, name)), type }));
			const patsOnly = chittlins.filter(item => item.uri.fsPath.endsWith('.pat') || item.uri.fsPath.endsWith('.nlp'));
			const orderedArray = new Array();
			let passnum = 0;
			var label: string = '';

			var seqFile = visualText.analyzer.seqFile;
			for (let pass of seqFile.getPasses()) {
				seqFile.setPass(pass);
				if (seqFile.isValid()) {
					passnum++;
					label = passnum.toString() + ' ' + seqFile.getName();
					if (seqFile.isRuleFile()) {
						var found = patsOnly.filter(item => item.uri.fsPath.endsWith(seqFile.fileName()));
						if (found.length)
							orderedArray.push({uri: found[0].uri, label: label, name: seqFile.getName(), tooltip: found[0].uri.path, contextValue: 'file', type: seqType.NLP, passNum: passnum, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
						else
							orderedArray.push({label: label, name: seqFile.getName(), tooltip: 'MISSING', contextValue: 'missing', type: seqType.MISSING, passNum: passnum, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
					} else {
						orderedArray.push({label: label, name: seqFile.getName(), tooltip: seqFile.getStubName(), contextValue: 'stub', type: seqType.STUB, passNum: passnum, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
					}			
				}
			}
			return orderedArray;
		}

		return [];
	}

	getTreeItem(seqItem: SequenceItem): vscode.TreeItem {
		if (seqItem.type === seqType.NLP || seqItem.type === seqType.MISSING) {
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
			seqFile.setFile(seqItem.uri);
			var basename = seqFile.getBasename();
			var row = seqFile.findPass(basename);

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
				if (seqItem.type == seqType.MISSING) {
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
					if (seqItem)
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
			var basename = path.basename(seqItem.uri.path,'.pat');
			vscode.window.showInputBox({ value: basename, prompt: 'Enter new name for pass' }).then(newname => {
				var original = seqItem.uri;
				if (newname) {
					seqFile.renamePass(basename,newname);
					var newfile = vscode.Uri.file(path.join(seqFile.getSpecDirectory().path,newname.concat(path.extname(original.path))));
					this.rename(original,newfile,{overwrite: false});
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
		if (seqItem.type == seqType.MISSING) {
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
					vscode.window.showWarningMessage('No tree file for this pass');
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