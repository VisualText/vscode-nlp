import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as rimraf from 'rimraf';

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

enum moveDirection {
	Up,
	Down
}

export class SequenceLine {
	line: string = '';
	type: string = '';
	tokens = new Array();

	constructor(line:string = '') {
		this.Set(line);
	}

	Set(line:string) {
		this.line = line;
		if (line.length)
			this.tokens = line.split(/[\t\s]/);
		else
			this.tokens = [];
	}

	CleanLine(line: string): string {
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
		if (this.tokens.length) {
			if (this.tokens[0].localeCompare('pat') == 0 ||
				this.tokens[0].localeCompare('rec') == 0 ||
				this.tokens[0].localeCompare('nlp') == 0)
				return true;
		}
		return false;
	}

	FileName(): string {
		return this.tokens[1].concat('.pat');
	}

	GetType(): string {
		return this.tokens[0];
	}

	GetName(): string {
		return this.tokens[1];
	}
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

		if (vscode.workspace.workspaceFolders) {
			const workspaceFolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];
			if (workspaceFolder) {
				const specUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath,'spec'));
				const children = await this.readDirectory(specUri);
				children.sort((a, b) => {
					if (a[1] === b[1]) {
						return a[0].localeCompare(b[0]);
					}
					return a[1] === vscode.FileType.Directory ? -1 : 1;
				});
				const chittlins = children.map(([name, type]) => ({ uri: vscode.Uri.file(path.join(specUri.fsPath, name)), type }));
				const patsOnly = chittlins.filter(item => item.uri.fsPath.endsWith('.pat') || item.uri.fsPath.endsWith('.nlp'));
				const orderedArray = new Array();
				var lines = fs.readFileSync(path.join(specUri.fsPath, 'analyzer.seq'), 'utf8').split('\n');
				var seqLine = new SequenceLine();

				for (let line of lines) {
					seqLine.Set(line);
					if (seqLine.IsValid()) {
						if (seqLine.IsRuleFile()) {
							var found = patsOnly.filter(item => item.uri.fsPath.endsWith(seqLine.FileName()));
							if (found.length)
								orderedArray.push(found[0].uri);
							else
								orderedArray.push(vscode.Uri.file(seqLine.FileName()));
						} else {
							orderedArray.push(vscode.Uri.file(seqLine.GetType()));
						}			
					}
				}
				const finalFiles = orderedArray.map(item => ({ uri: item, type: 1}));
				return finalFiles;
			}
		}

		return [];
	}

	getTreeItem(element: Entry): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(element.uri, element.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		if (element.type === vscode.FileType.File) {
			treeItem.command = { command: 'analyzerSequence.openFile', title: 'Open File', arguments: [element.uri], };
			treeItem.contextValue = 'file';
		}
		return treeItem;
	}

	moveUp(resource: Entry): void {
		this.moveSequence(resource,moveDirection.Up);
	}

	moveDown(resource: Entry): void {
		this.moveSequence(resource,moveDirection.Down);
	}
	
	moveSequence(resource: Entry, direction: moveDirection) {
		if (!fs.existsSync(resource.uri.path)) {
			vscode.window.showWarningMessage('Cannot move a non-file');
			return;
		}

		if (vscode.workspace.workspaceFolders) {
			const workspacefolder = vscode.workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];

			if (workspacefolder) {
				var newlines = new Array();
				var cleanlines = new Array();
				var basename = path.basename(resource.uri.path,'.pat');
		
				var specfilename = path.join(workspacefolder.uri.fsPath,'spec','analyzer.seq');
				var analyzeFile = vscode.Uri.file(specfilename);
				var lines = fs.readFileSync(analyzeFile.path, 'utf8').split('\n');
	
				var seqLine = new SequenceLine();

				for (let line of lines) {
					seqLine.Set(line);
					if (seqLine.IsValid()) {
						cleanlines.push(seqLine.CleanLine(line));
					}					
				}

				var row = -1;
				var r = 0;

				for (let line of lines) {
					seqLine.Set(line);
					if (basename.localeCompare(seqLine.GetName()) == 0) {
						row = r;
						break;
					}			
					r++;
				}
	
				// Build new file
				if (row >= 0 && row + 1 < cleanlines.length) {
					for (var i = 0; i < cleanlines.length; i++) {
						if ((direction == moveDirection.Up && i+1 == row) || (direction == moveDirection.Down && i == row)) {
							newlines.push(cleanlines[i+1]);
							newlines.push(cleanlines[i]);
							i++;
						}
						else if (cleanlines[i].length)
							newlines.push(cleanlines[i]);
					}
		
					// Make file from lines
					var newcontent = '';
					for (var i = 0; i < newlines.length; i++) {
						if (i > 0)
							newcontent = newcontent.concat('\n');
						newcontent = newcontent.concat(newlines[i]);
					}
		
					fs.writeFileSync(specfilename,newcontent,{flag:'w+'});
		
					this.refresh();					
				} else if (row == -1) {
					vscode.window.showWarningMessage('Item cannot move up');
				} else {
					vscode.window.showWarningMessage('Item cannot move down');					
				}
			}
		}
	}
}

export class AnalyzerSequence {

	private analyzerSequence: vscode.TreeView<Entry>;

	workspacefolder: vscode.WorkspaceFolder | undefined;
	basename = '';
	outfolder = '';
	inputFile = '';
	highlightFile = '';
	firedFroms = new Array();
	firedTos = new Array();

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new FileSystemProvider();
		this.analyzerSequence = vscode.window.createTreeView('analyzerSequence', { treeDataProvider });
		vscode.commands.registerCommand('analyzerSequence.openFile', (resource) => this.openResource(resource));
		vscode.commands.registerCommand('analyzerSequence.moveUp', (resource) => treeDataProvider.moveUp(resource));
		vscode.commands.registerCommand('analyzerSequence.moveDown', (resource) => treeDataProvider.moveDown(resource));
		vscode.commands.registerCommand('analyzerSequence.refreshEntry', () => treeDataProvider.refresh());
	}

	private openResource(resource: vscode.Uri): void {
		if (resource.path.localeCompare('/stub') == 0 || resource.path.localeCompare('/end') == 0 || resource.path.localeCompare('/tokenize') == 0) {
			vscode.window.showWarningMessage('Not editable');
			return;
		}
		this.workspacefolder = vscode.workspace.getWorkspaceFolder(resource);
		if (this.workspacefolder) {
			this.outfolder = path.join(this.workspacefolder.uri.fsPath,'output');
			if (fs.existsSync(this.outfolder)) {
				const firefile = this.findLogfile(resource);
				vscode.window.showTextDocument(firefile);
			}
		}
	}

	private fileCreateTime(filepath: string): Date {
		if (fs.existsSync(filepath)) {
			var stats = fs.statSync(filepath);
			if (stats)
				return stats.ctime;
		}
		return new Date(1970, 1, 1);
	}

	private fileGroup(logfile: vscode.Uri) {
		this.basename = path.basename(logfile.path,'.log');
		this.highlightFile = path.join(this.outfolder,this.basename+'.txxt');
		this.inputFile = path.join(this.outfolder,'input.txt');
	}

	private writeFiredText(logfile: vscode.Uri): vscode.Uri {
		this.fileGroup(logfile);
		var logDate: Date = this.fileCreateTime(logfile.path);
		var inputDate: Date = this.fileCreateTime(this.inputFile);
		if (inputDate < logDate && fs.existsSync(this.highlightFile))
			return vscode.Uri.file(this.highlightFile);
		else if (!fs.existsSync(this.inputFile))
			return logfile;

		var text = fs.readFileSync(this.inputFile, 'utf8');
		const regReplace = new RegExp('\r\n', 'g');
		text = text.replace(regReplace, '\r');

		var textfire = '';
		var lastTo = 0;
		var between = '';
		var highlight = '';
		var from = 0;
		var to = 0;

		if (this.firedFroms.length) {
			for (var i = 0; i < this.firedFroms.length; i++) {
				from = this.firedFroms[i];
				to = this.firedTos[i];
				between = text.substring(lastTo,from);
				highlight = text.substring(from,to+1);
				textfire = textfire.concat(between,'[[',highlight,']]');
				lastTo = to + 1;
				
				between = '';
			}
			textfire = textfire.concat(text.substring(lastTo,text.length));
		} else {
			textfire = text;
		}

		fs.writeFileSync(this.highlightFile,textfire,{flag:'w+'});

		this.firedFroms = [];
		this.firedTos = [];

		const regBack = new RegExp('\r', 'g');
		text = text.replace(regBack, '\r\n');
		return vscode.Uri.file(this.highlightFile);
	}

	private findLogfile(resource: vscode.Uri): vscode.Uri {
		var logfile = vscode.Uri.file('');
		var firefile = vscode.Uri.file('');

		const filenames = fs.readdirSync(this.outfolder);
		const restoks = path.basename(resource.path).split('.');
		const baser = restoks[0];

		var arrayLength = filenames.length;
		var re = new RegExp('\\w+', 'g');
		var refire = new RegExp('[\[,\]', 'g');

		for (var i = 0; i < arrayLength; i++) {
			var filename = filenames[i];
			if (filename.endsWith('.log')) {
				var lines = fs.readFileSync(path.join(this.outfolder,filename), 'utf8').split('\n');
				var l = 0;
				var found = false;
				var from = 0;
				var to = 0;

				for (let line of lines) {
					if (found) {
						var tokens = line.split(',fired');
						if (tokens.length > 1) {
							var tts = line.split(refire);
							if (+tts[2] > to) {
								from = +tts[1];
								to = +tts[2];
								this.firedFroms.push(from);
								this.firedTos.push(to);								
							}
						}
					}
					else if (l++ == 2) {
						var toks = line.match(re);
						if (toks) {
							var base = path.basename(resource.path,'.pat');
							if (baser.localeCompare(toks[2]) == 0) {
								logfile = vscode.Uri.file(path.join(this.outfolder,filename));
								found = true;
							}	
						} else {
							return vscode.Uri.file(path.join(this.outfolder,'final.log'));
						}
					}
				}
				if (found) {
					return this.writeFiredText(logfile);
				}
			}
		}

		return logfile;
	}
}