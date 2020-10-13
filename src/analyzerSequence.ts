import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as rimraf from 'rimraf';
import { moveDirection, nlpFileType, SequenceFile } from './sequence';
import { LogFile } from './logfile';

//#region Utilities

namespace _ {

	function handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
		if (error) {
			reject(massageError(error));
		} else {
			resolve(result);
		}
	}

	function massageError(error: Error & { code?: string }): Error {
		if (error.code === 'ENOENT') {
			return vscode.FileSystemError.FileNotFound();
		}

		if (error.code === 'EISDIR') {
			return vscode.FileSystemError.FileIsADirectory();
		}

		if (error.code === 'EEXIST') {
			return vscode.FileSystemError.FileExists();
		}

		if (error.code === 'EPERM' || error.code === 'EACCESS') {
			return vscode.FileSystemError.NoPermissions();
		}

		return error;
	}

	export function checkCancellation(token: vscode.CancellationToken): void {
		if (token.isCancellationRequested) {
			throw new Error('Operation cancelled');
		}
	}

	export function normalizeNFC(items: string): string;
	export function normalizeNFC(items: string[]): string[];
	export function normalizeNFC(items: string | string[]): string | string[] {
		if (process.platform !== 'darwin') {
			return items;
		}

		if (Array.isArray(items)) {
			return items.map(item => item.normalize('NFC'));
		}

		return items.normalize('NFC');
	}

	export function readdir(path: string): Promise<string[]> {
		return new Promise<string[]>((resolve, reject) => {
			fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
		});
	}

	export function stat(path: string): Promise<fs.Stats> {
		return new Promise<fs.Stats>((resolve, reject) => {
			fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
		});
	}

	export function readfile(path: string): Promise<Buffer> {
		return new Promise<Buffer>((resolve, reject) => {
			fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
		});
	}

	export function writefile(path: string, content: Buffer): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function exists(path: string): Promise<boolean> {
		return new Promise<boolean>((resolve, reject) => {
			fs.exists(path, exists => handleResult(resolve, reject, null, exists));
		});
	}

	export function rmrf(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			rimraf(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function mkdir(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			//mkdirp(path, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function rename(oldPath: string, newPath: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
		});
	}

	export function unlink(path: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
		});
	}
}

export class FileStat implements vscode.FileStat {

	constructor(private fsStat: fs.Stats) { }

	get type(): vscode.FileType {
		return this.fsStat.isFile() ? vscode.FileType.File : this.fsStat.isDirectory() ? vscode.FileType.Directory : this.fsStat.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
	}

	get isFile(): boolean | undefined {
		return this.fsStat.isFile();
	}

	get isDirectory(): boolean | undefined {
		return this.fsStat.isDirectory();
	}

	get isSymbolicLink(): boolean | undefined {
		return this.fsStat.isSymbolicLink();
	}

	get size(): number {
		return this.fsStat.size;
	}

	get ctime(): number {
		return this.fsStat.ctime.getTime();
	}

	get mtime(): number {
		return this.fsStat.mtime.getTime();
	}
}

interface Entry {
	uri: vscode.Uri;
	type: vscode.FileType;
}

//#endregion

export class FileSystemProvider implements vscode.TreeDataProvider<Entry>, vscode.FileSystemProvider {

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
			const children = await this.readDirectory(element.uri);
			return children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(element.uri.fsPath, name)), type }));
		}

		var seqFile = new SequenceFile();
		if (seqFile.HasWorkingDirectory()) {
			const children = await this.readDirectory(seqFile.GetSpecFolder());
			children.sort((a, b) => {
				if (a[1] === b[1]) {
					return a[0].localeCompare(b[0]);
				}
				return a[1] === vscode.FileType.Directory ? -1 : 1;
			});
			const chittlins = children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(seqFile.GetSpecFolder().fsPath, name)), type }));
			const patsOnly = chittlins.filter(item => item.uri.fsPath.endsWith('.pat') || item.uri.fsPath.endsWith('.nlp'));
			const orderedArray = new Array();

			for (let pass of  seqFile.GetPasses()) {
				seqFile.SetPass(pass);
				if (seqFile.IsValid()) {
					if (seqFile.IsRuleFile()) {
						var found = patsOnly.filter(item => item.uri.fsPath.endsWith(seqFile.FileName()));
						if (found.length)
							orderedArray.push({uri: found[0].uri, type: 1});
						else
							orderedArray.push({uri: vscode.Uri.file(seqFile.FileName()), type: 1});
					} else {
						orderedArray.push({uri: vscode.Uri.file(seqFile.GetStubName().concat('.stub')), type: 1});
					}			
				}
			}
			return orderedArray;
		}

		return [];
	}

	getTreeItem(element: Entry): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		if (element.type === vscode.FileType.File) {
			treeItem.command = { command: 'analyzerSequence.openFile', title: 'Open File', arguments: [element], };
			treeItem.contextValue = 'file';
		}
		return treeItem;
	}

	moveUp(resource: Entry): void {
		this.moveSequence(resource,moveDirection.UP);
	}

	moveDown(resource: Entry): void {
		this.moveSequence(resource,moveDirection.DOWN);
	}
	
	moveSequence(resource: Entry, direction: moveDirection) {
		var seqFile = new SequenceFile();
		if (seqFile.HasWorkingDirectory()) {
			seqFile.SetFile(resource.uri.path);
			var basename = seqFile.GetBasename();
			var row = seqFile.FindPass(basename);

			// Build new file
			if (row == 0) {
				vscode.window.showWarningMessage('Tokenize must be first');
			} else if (row == 1 && direction == moveDirection.UP) {
				vscode.window.showWarningMessage('Cannot move into the first position');

			} else if (row >= 1 && row + 1 < seqFile.GetPasses().length) {
				seqFile.MovePass(direction,row);
				seqFile.SaveFile();
				this.refresh();	

			} else if (row == -1) {
				vscode.window.showWarningMessage('Item cannot move up');
			} else {
				vscode.window.showWarningMessage('Item cannot move down');				
			}
		}
	}

	deletePass(resource: Entry): void {
		var seqFile = new SequenceFile();
		if (seqFile.HasWorkingDirectory()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'',path.basename(resource.uri.path),'\' pass');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete pass'});

			vscode.window.showQuickPick(items).then(selection => {
				seqFile.SetFile(resource.uri.path);
				if (!selection) {
					return;
				}
				if (selection.label.localeCompare('Yes') == 0) {
					seqFile.DeletePass(resource.uri);
					this.refresh();
				}
			});
		}
	}

	insertPass(resource: Entry): void {
		var seqFile = new SequenceFile();
		if (seqFile.HasWorkingDirectory()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Open',
				defaultUri: seqFile.GetSpecFolder(),
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
				seqFile.InsertPass(resource.uri,newfile);
				this.refresh();
			});			
		}
	}
	
	insertNewPass(resource: Entry): void {
		var seqFile = new SequenceFile();
		if (seqFile.HasWorkingDirectory()) {
			vscode.window.showInputBox({ value: 'newpass' }).then(newname => {
				var original = resource.uri;
				if (newname) {
					seqFile.InsertNewPass(resource.uri,newname);
					this.refresh();
				}
			});
		}
	}
	
	renamePass(resource: Entry): void {
		var seqFile = new SequenceFile();
		if (seqFile.HasWorkingDirectory()) {
			var basename = path.basename(resource.uri.path,'.pat');
			vscode.window.showInputBox({ value: basename }).then(newname => {
				var original = resource.uri;
				if (newname) {
					seqFile.RenamePass(basename,newname);
					var newfile = vscode.Uri.file(path.join(seqFile.GetSpecFolder().path,newname.concat(path.extname(original.path))));
					this.rename(original,newfile,{overwrite: false});
					this.refresh();
				}
			});
		}
	}
}

export let analyzerSequence: AnalyzerSequence;
export class AnalyzerSequence {

	private analyzerSequence: vscode.TreeView<Entry>;
	workspacefolder: vscode.WorkspaceFolder | undefined;
	private seqFile = new SequenceFile();
	private logFile = new LogFile();

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new FileSystemProvider();
		this.analyzerSequence = vscode.window.createTreeView('analyzerSequence', { treeDataProvider });
		vscode.commands.registerCommand('analyzerSequence.openFile', (resource) => this.openNLP(resource));
		vscode.commands.registerCommand('analyzerSequence.openTree', (resource) => this.openTree(resource));
		vscode.commands.registerCommand('analyzerSequence.openHighlight', (resource) => this.openHighlight(resource));
		vscode.commands.registerCommand('analyzerSequence.openKB', (resource) => this.openKB(resource));
		vscode.commands.registerCommand('analyzerSequence.moveUp', (resource) => treeDataProvider.moveUp(resource));
		vscode.commands.registerCommand('analyzerSequence.moveDown', (resource) => treeDataProvider.moveDown(resource));
		vscode.commands.registerCommand('analyzerSequence.refreshEntry', () => treeDataProvider.refresh());
		vscode.commands.registerCommand('analyzerSequence.insert', (resource) => treeDataProvider.insertPass(resource));
		vscode.commands.registerCommand('analyzerSequence.insertNew', (resource) => treeDataProvider.insertNewPass(resource));
		vscode.commands.registerCommand('analyzerSequence.delete', (resource) => treeDataProvider.deletePass(resource));
		vscode.commands.registerCommand('analyzerSequence.rename', (resource) => treeDataProvider.renamePass(resource));
	}

    static attach(ctx: vscode.ExtensionContext) {
        if (!analyzerSequence) {
            analyzerSequence = new AnalyzerSequence(ctx);
        }
        return analyzerSequence;
    }

	private openNLP(resource: Entry): void {
		this.seqFile.SetFile(resource.uri.path);
		if (!this.seqFile.IsRuleFile()) {
			vscode.window.showWarningMessage('Not editable');
			return;
		}
		vscode.window.showTextDocument(resource.uri);
	}
	
	private openTree(resource: Entry): void {
		this.seqFile.SetFile(resource.uri.path);
		if (!this.seqFile.IsRuleFile()) {
			vscode.window.showWarningMessage('Not editable');
			return;
		}
		this.workspacefolder = vscode.workspace.getWorkspaceFolder(resource.uri);
		if (this.workspacefolder) {
			this.logFile.setOutputFolder(path.join(this.workspacefolder.uri.fsPath,'output'));
			if (fs.existsSync(this.logFile.getOutputFolder())) {
				var logfile = this.logFile.findLogfile(resource.uri,nlpFileType.LOG);
				if (logfile)
					vscode.window.showTextDocument(logfile);
				else
					vscode.window.showTextDocument(resource.uri);
			}
		}
	}

	private openHighlight(resource: Entry): void {
		this.seqFile.SetFile(resource.uri.path);
		if (!this.seqFile.IsRuleFile()) {
			vscode.window.showWarningMessage('Not editable');
			return;
		}
		this.workspacefolder = vscode.workspace.getWorkspaceFolder(resource.uri);
		if (this.workspacefolder) {
			this.logFile.setOutputFolder(path.join(this.workspacefolder.uri.fsPath,'output'));
			if (fs.existsSync(this.logFile.getOutputFolder())) {
				var firefile = this.logFile.findLogfile(resource.uri,nlpFileType.TXXT);
				if (firefile)
					vscode.window.showTextDocument(firefile);
				else
					vscode.window.showTextDocument(resource.uri);
			}
		}
	}

	private openKB(resource: Entry): void {
		this.seqFile.SetFile(resource.uri.path);
		if (!this.seqFile.IsRuleFile()) {
			vscode.window.showWarningMessage('Not editable');
			return;
		}
		this.workspacefolder = vscode.workspace.getWorkspaceFolder(resource.uri);
		if (this.workspacefolder) {
			this.logFile.setOutputFolder(path.join(this.workspacefolder.uri.fsPath,'output'));
			if (fs.existsSync(this.logFile.getOutputFolder())) {
				var kbfile = this.logFile.findLogfile(resource.uri,nlpFileType.KB);
				if (fs.existsSync(kbfile.path))
					vscode.window.showTextDocument(kbfile);
				else
					vscode.window.showWarningMessage('No KB file for this pass');
			}
		}
	}
}