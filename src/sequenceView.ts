import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { SequenceFile, seqType, moveDirection } from './sequence';
import { TextFile, nlpFileType } from './textFile';
import { LogFile } from './logfile';
import { FileStat, _ } from './fileExplorer';

class Entry extends vscode.TreeItem {
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

export class PassTree implements vscode.TreeDataProvider<Entry>, vscode.FileSystemProvider {

	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]>;
	
	private _onDidChangeTreeData: vscode.EventEmitter<Entry> = new vscode.EventEmitter<Entry>();
	readonly onDidChangeTreeData: vscode.Event<Entry> = this._onDidChangeTreeData.event;

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

	async getChildren(element?: Entry): Promise<Entry[]> {
		if (element) {
			return [];
		}

		if (visualText.hasWorkingDirectory()) {
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

			var seqFile = new SequenceFile();
			for (let pass of seqFile.getPasses()) {
				seqFile.setPass(pass);
				if (seqFile.isValid()) {
					passnum++;
					label = passnum.toString() + ' ' + seqFile.getName();
					if (seqFile.isRuleFile()) {
						var found = patsOnly.filter(item => item.uri.fsPath.endsWith(seqFile.fileName()));
						if (found.length)
							orderedArray.push({uri: found[0].uri, label: label, contextValue: 'file', type: seqType.NLP, pass: passnum, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
						else
							orderedArray.push({uri: vscode.Uri.file(seqFile.fileName()), label: label, contextValue: 'file', type: seqType.NLP, pass: passnum, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
					} else {
						orderedArray.push({uri: vscode.Uri.file(seqFile.getStubName().concat('.stub')), label: label, contextValue: 'stub', type: seqType.STUB, pass: passnum, collapsibleState: vscode.TreeItemCollapsibleState.Collapsed});
					}			
				}
			}
			return orderedArray;
		}

		return [];
	}

	getTreeItem(element: Entry): vscode.TreeItem {
		if (element.type === seqType.NLP) {
			element.command = { command: 'sequenceView.openFile', title: "Open File", arguments: [element] };
			element.iconPath = {
				light: path.join(__filename, '..', '..', 'fileicons', 'images', 'light', 'gear.svg'),
				dark: path.join(__filename, '..', '..', 'fileicons', 'images', 'dark', 'gear.svg')
			};
		} else {
			element.iconPath = {
				light: path.join(__filename, '..', '..', 'resources', 'light', 'circle-filled.svg'),
				dark: path.join(__filename, '..', '..', 'resources', 'dark', 'circle-filled.svg')
			};
		}
		element.collapsibleState = vscode.TreeItemCollapsibleState.None;
		return element;
	}

	moveUp(resource: Entry): void {
		this.moveSequence(resource,moveDirection.UP);
	}

	moveDown(resource: Entry): void {
		this.moveSequence(resource,moveDirection.DOWN);
	}
	
	moveSequence(resource: Entry, direction: moveDirection) {
		if (visualText.hasWorkingDirectory()) {
			var seqFile = new SequenceFile();
			seqFile.setFile(resource.uri.path);
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

	deletePass(resource: Entry): void {
		if (visualText.hasWorkingDirectory()) {
			var seqFile = new SequenceFile();
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(resource.uri.path),'\' pass');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete pass'});

			vscode.window.showQuickPick(items).then(selection => {
				seqFile.setFile(resource.uri.path);
				if (!selection) {
					return;
				}
				if (selection.label.localeCompare('Yes') == 0) {
					seqFile.deletePass(resource.uri);
					this.refresh();
				}
			});
		}
	}

	insertPass(resource: Entry): void {
		if (visualText.hasWorkingDirectory()) {
			var seqFile = new SequenceFile();
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
				seqFile.insertPass(resource.uri,newfile);
				this.refresh();
			});			
		}
	}
	
	insertNewPass(resource: Entry): void {
		if (visualText.hasWorkingDirectory()) {
			var seqFile = new SequenceFile();
			vscode.window.showInputBox({ value: 'newpass' }).then(newname => {
				var original = resource.uri;
				if (newname) {
					seqFile.insertNewPass(resource.uri,newname);
					this.refresh();
				}
			});
		}
	}
	
	renamePass(resource: Entry): void {
		if (visualText.hasWorkingDirectory()) {
			var seqFile = new SequenceFile();
			var basename = path.basename(resource.uri.path,'.pat');
			vscode.window.showInputBox({ value: basename }).then(newname => {
				var original = resource.uri;
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

	private sequenceView: vscode.TreeView<Entry>;
	workspacefolder: vscode.WorkspaceFolder | undefined;
	private textFile = new TextFile();
	private logFile = new LogFile();

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new PassTree();
		this.sequenceView = vscode.window.createTreeView('sequenceView', { treeDataProvider });
		vscode.commands.registerCommand('sequenceView.openFile', (resource) => this.openNLP(resource));
		vscode.commands.registerCommand('sequenceView.openTree', (resource) => this.openTree(resource));
		vscode.commands.registerCommand('sequenceView.openHighlight', (resource) => this.openHighlight(resource));
		vscode.commands.registerCommand('sequenceView.openKB', (resource) => this.openKB(resource));
		vscode.commands.registerCommand('sequenceView.moveUp', (resource) => treeDataProvider.moveUp(resource));
		vscode.commands.registerCommand('sequenceView.moveDown', (resource) => treeDataProvider.moveDown(resource));
		vscode.commands.registerCommand('sequenceView.refreshAll', () => treeDataProvider.refresh());
		vscode.commands.registerCommand('sequenceView.insert', (resource) => treeDataProvider.insertPass(resource));
		vscode.commands.registerCommand('sequenceView.insertNew', (resource) => treeDataProvider.insertNewPass(resource));
		vscode.commands.registerCommand('sequenceView.delete', (resource) => treeDataProvider.deletePass(resource));
		vscode.commands.registerCommand('sequenceView.rename', (resource) => treeDataProvider.renamePass(resource));
	}

    static attach(ctx: vscode.ExtensionContext) {
        if (!sequenceView) {
            sequenceView = new SequenceView(ctx);
        }
        return sequenceView;
    }

	private openNLP(resource: Entry): void {
		this.textFile.setFile(resource.uri.fsPath);
		if (!this.textFile.isFileType(nlpFileType.NLP)) {
			vscode.window.showWarningMessage('Not editable');
			return;
		}
		vscode.window.showTextDocument(resource.uri);
	}
	
	private openTree(resource: Entry): void {
		this.textFile.setFile(resource.uri.fsPath);
		if (!this.textFile.isFileType(nlpFileType.NLP)) {
			vscode.window.showWarningMessage('Not editable');
			return;
		}
		if (fs.existsSync(visualText.analyzer.getOutputDirectory().path)) {
			this.logFile.setFile(resource.uri.path);
			var logfile = this.logFile.anaFile(resource.pass,nlpFileType.TREE);
			if (fs.existsSync(logfile.path))
				vscode.window.showTextDocument(logfile);
			else
				vscode.window.showWarningMessage('No tree file for this pass');
		}
	}

	private openHighlight(resource: Entry): void {
		this.textFile.setFile(resource.uri.path);
		if (!this.textFile.isFileType(nlpFileType.NLP)) {
			vscode.window.showWarningMessage('Not editable');
			return;
		}
		if (fs.existsSync(visualText.analyzer.getOutputDirectory().path)) {
			this.logFile.setFile(resource.uri.path);
			var firefile = this.logFile.firedFile(resource.pass);
			if (fs.existsSync(firefile.path))
				vscode.window.showTextDocument(firefile);
			else
				vscode.window.showWarningMessage('No highlight file with this pass');
		}
	}

	private openKB(resource: Entry): void {
		this.textFile.setFile(resource.uri.path);
		if (!this.textFile.isFileType(nlpFileType.NLP)) {
			vscode.window.showWarningMessage('Not editable');
			return;
		}
		if (fs.existsSync(visualText.analyzer.getOutputDirectory().path)) {
			this.logFile.setFile(resource.uri.path);
			var kbfile = this.logFile.anaFile(resource.pass,nlpFileType.KB);
			if (fs.existsSync(kbfile.path))
				vscode.window.showTextDocument(kbfile);
			else
				vscode.window.showWarningMessage('No KB file for this pass');
		}
	}
}