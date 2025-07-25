import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { dirfuncs } from './dirfuncs';
import { textView, TextItem } from './textView';
import { fileOpRefresh, fileOperation } from './fileOps';
import { SequenceFile } from './sequence';
import { TextFile } from './textFile';
import { anaSubDir } from './analyzer';

export enum analyzerItemType { ANALYZER, FOLDER, NLP, SEQUENCE, ECL, MANIFEST, FILE, README }

interface AnalyzerItem {
	uri: vscode.Uri;
	type: analyzerItemType;
	hasLogs: boolean;
	hasPats: boolean;
	hasReadme: boolean;
	moveUp: boolean;
	moveDown: boolean;
}

export class AnalyzerTreeDataProvider implements vscode.TreeDataProvider<AnalyzerItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<AnalyzerItem | undefined | null | void> = new vscode.EventEmitter<AnalyzerItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<AnalyzerItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	async getChildren(analyzerItem?: AnalyzerItem): Promise<AnalyzerItem[]> {
		visualText.getAnalyzers(false);
		if (analyzerItem) {
			return this.getKeepers(analyzerItem.uri);
		}
		if (visualText.hasWorkspaceFolder() && visualText.hasAnalyzers()) {
			return this.getKeepers(visualText.getWorkspaceFolder());
		}
		return [];
	}

	getMovement(analyzerItem: AnalyzerItem) {
		analyzerItem.moveDown = false;
		analyzerItem.moveUp = false;
		const itemPath = analyzerItem.uri.fsPath;
		const parent = path.dirname(itemPath);
		const anaDir = visualText.getAnalyzerDir().fsPath;
		if (parent != anaDir) {
			analyzerItem.moveUp = true;
		}
		if (analyzerItem.type == analyzerItemType.FOLDER) {
			if (dirfuncs.parentHasOtherDirs(analyzerItem.uri)) {
				analyzerItem.moveDown = true;
			}
		} else if (dirfuncs.parentHasOtherDirs(vscode.Uri.file(itemPath))) {
			analyzerItem.moveDown = true;
		}
	}

	getTreeItem(analyzerItem: AnalyzerItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(analyzerItem.uri, visualText.isAnalyzerDirectory(analyzerItem.uri) ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
		this.getMovement(analyzerItem);
		let conVal = analyzerItem.moveDown ? 'moveDown' : '';
		if (analyzerItem.moveUp)
			conVal = conVal + 'moveUp';
		if (analyzerItem.hasReadme)
			conVal = conVal + 'readMe';

		const icon = this.fileIconFromType(analyzerItem.type);
		treeItem.iconPath = {
			light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', icon)),
			dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', icon))
		}

		if (analyzerItem.type === analyzerItemType.ANALYZER) {
			treeItem.command = { command: 'analyzerView.openAnalyzer', title: "Open Analyzer", arguments: [analyzerItem] };
			const hasLogs = treeItem.contextValue = analyzerItem.hasLogs ? 'hasLogs' : '';
			treeItem.contextValue = conVal + hasLogs + 'isAnalyzer';
			treeItem.tooltip = analyzerItem.uri.fsPath;

		} else if (analyzerItem.type === analyzerItemType.FOLDER) {
			treeItem.contextValue = conVal + 'isFolder';
			treeItem.tooltip = analyzerItem.uri.fsPath;
			treeItem.command = { command: 'analyzerView.openAnalyzer', title: "Open Analyzer", arguments: [analyzerItem] };

		} else if (analyzerItem.type === analyzerItemType.NLP) {
			treeItem.tooltip = analyzerItem.uri.fsPath;
			treeItem.collapsibleState = 0;
			treeItem.command = { command: 'analyzerView.openFile', title: "Open File", arguments: [analyzerItem] };

		} else {
			if (analyzerItem.uri.fsPath.endsWith('.ecl'))
				conVal = conVal + 'isECL';
			else if (analyzerItem.uri.fsPath.endsWith('.md'))
				conVal = conVal + 'isReadMe';
			treeItem.contextValue = conVal + 'isFile';
			treeItem.tooltip = analyzerItem.uri.fsPath;
			treeItem.collapsibleState = 0;

			treeItem.command = { command: 'analyzerView.openFile', title: "Open File", arguments: [analyzerItem] };
		}
		//treeItem.label = treeItem.label + ' ' + treeItem.contextValue;
		return treeItem;
	}

	getKeepers(dir: vscode.Uri): AnalyzerItem[] {
		const keepers = Array();
		const entries = dirfuncs.getDirectoryTypes(dir);
		let type: analyzerItemType = analyzerItemType.ANALYZER;

		for (const entry of entries) {
			if (entry.type == vscode.FileType.Directory) {
				type = visualText.isAnalyzerDirectory(entry.uri) ? analyzerItemType.ANALYZER : analyzerItemType.FOLDER;
				const hasLogs = dirfuncs.analyzerHasLogFiles(entry.uri);
				const hasReadme = dirfuncs.hasFile(entry.uri, "README.md");
				keepers.push({ uri: entry.uri, type: type, hasLogs: hasLogs, hasPats: false, hasReadme: hasReadme, moveUp: false, moveDown: false });

			} else if (entry.type == vscode.FileType.File) {
				type = this.typeFromExtension(entry.uri);
				keepers.push({ uri: entry.uri, type: type, hasLogs: false, hasPats: false, hasReadme: false, moveUp: false, moveDown: false });
			}
		}

		const hasAllLogs = dirfuncs.hasLogDirs(visualText.getWorkspaceFolder(), true);
		vscode.commands.executeCommand('setContext', 'analyzers.hasLogs', hasAllLogs);
		return keepers;
	}

	typeFromExtension(dir: vscode.Uri): analyzerItemType {
		let type = analyzerItemType.FILE;
		const dirPath = dir.fsPath;
		if (dirPath.endsWith('.nlp'))
			type = analyzerItemType.NLP;
		else if (dirPath.endsWith('.seq'))
			type = analyzerItemType.SEQUENCE;
		else if (dirPath.endsWith('.ecl'))
			type = analyzerItemType.ECL;
		else if (dirPath.endsWith('.manifest'))
			type = analyzerItemType.MANIFEST
		else if (dirPath.endsWith('.md'))
			type = analyzerItemType.README
		return type;
	}

	fileIconFromType(type: analyzerItemType): string {

		let icon = 'file.svg';
		if (type == analyzerItemType.ANALYZER) {
			icon = 'gear.svg';
		} else if (type == analyzerItemType.FOLDER) {
			icon = 'folder.svg';
		} else if (type == analyzerItemType.NLP) {
			icon = 'nlp.svg';
		} else if (type == analyzerItemType.SEQUENCE) {
			icon = 'seq-circle.svg';
		} else if (type == analyzerItemType.ECL) {
			icon = 'ecl.svg';
		} else if (type == analyzerItemType.MANIFEST) {
			icon = 'manifest.svg';
		} else if (type == analyzerItemType.README) {
			icon = 'readme.svg';
		}
		return icon;
	}
}

export let analyzerView: AnalyzerView;
export class AnalyzerView {

	public analyzerView: vscode.TreeView<AnalyzerItem>;
	public folderUri: vscode.Uri | undefined;
	public chosen: vscode.Uri | undefined;
	public converting: boolean;
	private sequenceFile = new SequenceFile;

	constructor(context: vscode.ExtensionContext) {
		const analyzerViewProvider = new AnalyzerTreeDataProvider();
		this.analyzerView = vscode.window.createTreeView('analyzerView', { treeDataProvider: analyzerViewProvider });
		vscode.commands.registerCommand('analyzerView.refreshAll', () => analyzerViewProvider.refresh());
		vscode.commands.registerCommand('analyzerView.newAnalyzer', (resource) => this.newAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.deleteAnalyzer', resource => this.deleteAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.deleteFile', resource => this.deleteFile(resource));
		vscode.commands.registerCommand('analyzerView.deleteFolder', resource => this.deleteFolder(resource));
		vscode.commands.registerCommand('analyzerView.loadExampleAnalyzers', resource => this.loadExampleAnalyzers());
		vscode.commands.registerCommand('analyzerView.openAnalyzer', resource => this.openAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.deleteAnalyzerLogs', resource => this.deleteAnalyzerLogs(resource));
		vscode.commands.registerCommand('analyzerView.deleteAllAnalyzerLogs', () => this.deleteAllAnalyzerLogs());
		vscode.commands.registerCommand('analyzerView.updateTitle', resource => this.updateTitle(resource));
		vscode.commands.registerCommand('analyzerView.copyAnalyzer', resource => this.copyAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.dupeAnalyzer', resource => this.dupeAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.explore', resource => this.explore(resource));
		vscode.commands.registerCommand('analyzerView.newFolder', resource => this.newFolder(resource));
		vscode.commands.registerCommand('analyzerView.moveToFolder', resource => this.moveToFolder(resource));
		vscode.commands.registerCommand('analyzerView.moveUp', resource => this.moveUp(resource));
		vscode.commands.registerCommand('analyzerView.readMe', resource => this.readMe(resource));
		vscode.commands.registerCommand('analyzerView.createReadMe', resource => this.editReadMe(resource));
		vscode.commands.registerCommand('analyzerView.editReadMe', resource => this.editReadMe(resource));
		vscode.commands.registerCommand('analyzerView.deleteReadMe', resource => this.deleteReadMe(resource));
		vscode.commands.registerCommand('analyzerView.moveDownFolder', resource => this.moveDownFolder(resource));
		vscode.commands.registerCommand('analyzerView.moveToParent', resource => this.moveToParent(resource));
		vscode.commands.registerCommand('analyzerView.renameAnalyzer', resource => this.renameAnalyzer(resource));
		vscode.commands.registerCommand('analyzerView.renameFile', resource => this.renameFile(resource));
		vscode.commands.registerCommand('analyzerView.renameFolder', resource => this.renameFolder(resource));
		vscode.commands.registerCommand('analyzerView.openFile', resource => this.openFile(resource));
		vscode.commands.registerCommand('analyzerView.importAnalyzers', resource => this.importAnalyzers(resource));
		vscode.commands.registerCommand('analyzerView.manifestGenerate', resource => this.manifestGenerate(resource));
		vscode.commands.registerCommand('analyzerView.newECLFile', resource => this.newECLFile(resource));
		vscode.commands.registerCommand('analyzerView.exploreAll', () => this.exploreAll());
		vscode.commands.registerCommand('analyzerView.copyAll', () => this.copyAll());
		vscode.commands.registerCommand('analyzerView.updateColorizer', () => this.updateColorizer());
		vscode.commands.registerCommand('analyzerView.video', () => this.video());
		vscode.commands.registerCommand('analyzerView.copyPath', () => this.copyPath());

		visualText.colorizeAnalyzer();
		this.folderUri = undefined;
		this.converting = false;
	}

	static attach(ctx: vscode.ExtensionContext) {
		if (!analyzerView) {
			analyzerView = new AnalyzerView(ctx);
		}
		return analyzerView;
	}

	copyPath() {
		const dir = visualText.getAnalyzerDir();
		vscode.env.clipboard.writeText(dir.fsPath);
	}

	checkForECLAnalyzersDir(): vscode.QuickPickItem[] {
		const items: vscode.QuickPickItem[] = visualText.analyzerList('analyzers');
		if (items.length == 0) {
			vscode.window.showWarningMessage('You must have an \'analyzers\' folder containing your NLP analyzers when using the ECL Plugin in order to create an ECL Manifest file.');
			return [];
		}
		return items;
	}

	newECLFile(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder() && this.checkForECLAnalyzersDir().length > 0) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter ECL file name' }).then(newname => {
				if (newname) {
					const dirPath = visualText.getWorkspaceFolder().fsPath;
					// if (analyzerItem) {
					// 	if (dirfuncs.isDir(analyzerItem.uri.fsPath))
					// 		dirPath = analyzerItem.uri.fsPath;
					// 	else
					// 		dirPath = path.dirname(analyzerItem.uri.fsPath);
					// }
					this.createNewECLFile(dirPath, newname);
				}
			});
		}
	}

	createNewECLFile(dirPath: string, fileName: string): boolean {
		const items: vscode.QuickPickItem[] = [];
		const fromDir = path.join(visualText.getVisualTextDirectory('ecl'));

		if (dirfuncs.isDir(fromDir)) {
			const files = dirfuncs.getFiles(vscode.Uri.file(fromDir));
			const textFile = new TextFile();
			for (const file of files) {
				let firstLine = textFile.readFirstLine(file.fsPath).trim();
				firstLine = firstLine.replace("// ", "");
				items.push({ label: path.basename(file.fsPath), description: ' ' + firstLine });
			}
			vscode.window.showQuickPick(items, { title: 'Creating New ECL File', canPickMany: false, placeHolder: 'Choose ecl block' }).then(selection => {
				if (!selection) {
					return false;
				}
				const name = path.join(fromDir, selection.label);
				textFile.setFile(vscode.Uri.file(name));
				this.saveECLFile(dirPath, fileName, textFile.getText());
				return true;
			});
		} else {
			this.saveECLFile(dirPath, fileName, "a := 'Hello world!';\noutput(a);");
		}

		return false;
	}

	saveECLFile(dirPath: string, fileName: string, text: string) {
		let filePath = path.join(dirPath, fileName + '.ecl');
		if (path.extname(fileName))
			filePath = path.join(dirPath, fileName);
		dirfuncs.writeFile(filePath, text);
		vscode.commands.executeCommand('analyzerView.refreshAll');
		vscode.window.showTextDocument(vscode.Uri.file(filePath));
	}

	manifestGenerate(analyzerItem: AnalyzerItem) {
		const items: vscode.QuickPickItem[] = this.checkForECLAnalyzersDir();
		if (items.length == 0) {
			return;
		}
		const title = 'Generate HPCC Manifest File';
		const placeHolder = 'Choose Analyzers to Manifest';

		vscode.window.showQuickPick(items, { title, canPickMany: true, placeHolder: placeHolder }).then(selections => {
			if (!selections)
				return;

			const files: string[] = [];
			const start = visualText.getAnalyzerDir().fsPath.length;

			for (const selection of selections) {
				const analyzerPath = selection.description;
				if (analyzerPath) {
					const analyzerFiles = this.getAnalyzerManifestFiles(analyzerPath);
					for (const file of analyzerFiles) {
						files.push(this.cleanPath(file, start));
					}

					// KB FILES
					const kbPath = visualText.analyzer.constructDir(vscode.Uri.file(analyzerPath), anaSubDir.KB);
					const kbFiles = dirfuncs.getFiles(kbPath, ['.dict', '.kbb', '.kb']);
					for (const file of kbFiles) {
						files.push(this.cleanPath(file.fsPath, start));
					}

					// ENGINE DATA FILES
					// let datas = this.copyDataFolder();
					// for (let file of datas) {
					// 	files.push(this.cleanPath(file,start));
					// }
				}
			}

			// Write files to manifest
			const filepath = path.parse(analyzerItem.uri.fsPath);
			const manifestFile = this.getManifestFilePath(filepath.name);
			const mannie = fs.createWriteStream(manifestFile, { flags: 'w' });
			mannie.write('<Manifest>\n');
			for (const file of files) {
				mannie.write('    <Resource filename="' + file + '" />\n');
			}
			mannie.write('</Manifest>');
			mannie.close();

			vscode.commands.executeCommand('analyzerView.refreshAll');
			vscode.window.showTextDocument(vscode.Uri.file(manifestFile));
		});
	}

	cleanPath(file: string, start: number): string {
		let relative = file.substring(start);
		relative = relative.replace(new RegExp('\\\\', 'g'), '/');
		relative = relative.substring(1);
		return relative;
	}

	getManifestFilePath(elcFileName: string): string {
		return path.join(visualText.getAnalyzerDir().fsPath, elcFileName + '.manifest');
	}

	getAnalyzerManifestFiles(dir: string): string[] {
		const files: string[] = [];
		const specDir = path.join(dir, visualText.ANALYZER_SEQUENCE_FOLDER);
		this.sequenceFile.setSpecDir(specDir);
		this.sequenceFile.getPassFiles(specDir);
		files.push(path.join(specDir, visualText.ANALYZER_SEQUENCE_FILE));
		for (const item of this.sequenceFile.getPassItems()) {
			const p = item.uri.fsPath;
			if (p.length > 2 && fs.existsSync(p))
				files.push(item.uri.fsPath);
		}
		return files;
	}

	// No longer needed but leaving around JUST IN CASE
	copyDataFolder(): string[] {
		const files: string[] = [];
		const dataFolder = path.join(visualText.getAnalyzerDir().fsPath, 'data', 'rfb', visualText.ANALYZER_SEQUENCE_FOLDER);
		if (!fs.existsSync(dataFolder)) {
			const engineData = path.join(visualText.engineDirectory().fsPath, 'data', 'rfb', visualText.ANALYZER_SEQUENCE_FOLDER);
			visualText.fileOps.addFileOperation(vscode.Uri.file(engineData), vscode.Uri.file(dataFolder), [fileOpRefresh.ANALYZERS], fileOperation.COPY);
			visualText.fileOps.startFileOps();
		}
		const uris = dirfuncs.getFiles(vscode.Uri.file(dataFolder));

		for (const uri of uris) {
			files.push(uri.fsPath);
		}
		return files;
	}

	openFile(analyzerItem: AnalyzerItem): void {
		if (analyzerItem.type == analyzerItemType.README)
			vscode.commands.executeCommand("markdown.showPreview", analyzerItem.uri);
		else
			vscode.window.showTextDocument(analyzerItem.uri);
	}

	video() {
		const url = 'http://vscodeanaviewer.visualtext.org';
		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
	}

	renameAnalyzer(analyzerItem: AnalyzerItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(analyzerItem.uri.fsPath), prompt: 'Enter new Analyzer name' }).then(newname => {
				if (newname) {
					const original = analyzerItem.uri;
					if (path.extname(newname).length == 0)
						newname = newname + path.extname(analyzerItem.uri.fsPath);
					const newfile = vscode.Uri.file(path.join(path.dirname(analyzerItem.uri.fsPath), newname));
					visualText.fileOps.addFileOperation(analyzerItem.uri, newfile, [fileOpRefresh.ANALYZERS], fileOperation.RENAME);
					visualText.fileOps.startFileOps();
				}
			});
		}
	}

	renameFile(analyzerItem: AnalyzerItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(analyzerItem.uri.fsPath), prompt: 'Enter new file name' }).then(newname => {
				if (newname) {
					const original = analyzerItem.uri;
					if (path.extname(newname).length == 0)
						newname = newname + path.extname(analyzerItem.uri.fsPath);
					const newfile = vscode.Uri.file(path.join(path.dirname(analyzerItem.uri.fsPath), newname));
					visualText.fileOps.addFileOperation(analyzerItem.uri, newfile, [fileOpRefresh.ANALYZERS], fileOperation.RENAME);
					visualText.fileOps.startFileOps();
				}
			});
		}
	}

	renameFolder(analyzerItem: AnalyzerItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(analyzerItem.uri.fsPath), prompt: 'Enter new folder name' }).then(newname => {
				if (newname) {
					const original = analyzerItem.uri;
					const newfile = vscode.Uri.file(path.join(path.dirname(analyzerItem.uri.fsPath), newname));
					visualText.fileOps.addFileOperation(analyzerItem.uri, newfile, [fileOpRefresh.ANALYZERS], fileOperation.RENAME);
					visualText.fileOps.startFileOps();
				}
			});
		}
	}

	moveDownFolder(analyzerItem: AnalyzerItem) {
		this.openFolder(analyzerItem.uri);
	}

	moveToParent(analyzerItem: AnalyzerItem) {
		const parent = vscode.Uri.file(path.dirname(path.dirname(analyzerItem.uri.fsPath)));
		this.openFolder(parent);
	}

	openFolder(dir: vscode.Uri) {
		vscode.commands.executeCommand("vscode.openFolder", dir);
		vscode.commands.executeCommand('workbench.action.openPanel');
	}

	updateColorizer() {
		visualText.colorizeAnalyzer(true);
	}

	importAnalyzers(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			const seqFile = visualText.analyzer.seqFile;
			const options: vscode.OpenDialogOptions = {
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: true,
				openLabel: 'Import Analyzer(s)',
				defaultUri: seqFile.getSpecDirectory()
			};
			vscode.window.showOpenDialog(options).then(selections => {
				if (!selections) {
					return;
				}
				let analyzerDirExists = false;
				let analyzerPath = '';
				if (analyzerItem === undefined) {
					analyzerPath = visualText.analyzer.getAnalyzerDirectory().fsPath;
				} else {
					analyzerPath = analyzerItem.uri.fsPath;
					if (visualText.isAnalyzerDirectory(analyzerItem.uri))
						analyzerPath = path.dirname(analyzerPath);
				}

				for (const select of selections) {
					if (visualText.isAnalyzerDirectory(select)) {
						const dirname = path.basename(select.fsPath);
						visualText.fileOps.addFileOperation(select, vscode.Uri.file(path.join(analyzerPath, dirname)), [fileOpRefresh.ANALYZERS], fileOperation.COPY);
						analyzerDirExists = true;
					}
				}
				if (analyzerDirExists)
					visualText.fileOps.startFileOps();
				else
					vscode.window.showWarningMessage('No analyzers were selected');
			});
		}
	}

	newFolder(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'dirname', prompt: 'Enter folder name' }).then(newdir => {
				if (newdir) {
					let dirPath = '';
					if (!analyzerItem) {
						dirPath = visualText.getAnalyzerDir().fsPath;
					} else if (analyzerItem.type == analyzerItemType.FOLDER) {
						dirPath = analyzerItem.uri.fsPath;
					} else {
						dirPath = path.dirname(analyzerItem.uri.fsPath);
					}

					dirfuncs.makeDir(path.join(dirPath, newdir));
					vscode.commands.executeCommand('analyzerView.refreshAll');
				}
			});
		}
	}

	moveToFolder(analyzerItem: AnalyzerItem) {
		if (this.folderUri) {
			const to = path.join(this.folderUri.fsPath, path.basename(analyzerItem.uri.fsPath));
			dirfuncs.rename(analyzerItem.uri.fsPath, to);
			vscode.commands.executeCommand('analyzerView.refreshAll');
		} else {
			vscode.window.showInformationMessage('No folder selected');
		}
	}

	deleteReadMe(analyzerItem: AnalyzerItem) {
		const readMe = vscode.Uri.file(path.join(analyzerItem.uri.fsPath, "README.md"));
		if (fs.existsSync(readMe.fsPath)) {
			const items: vscode.QuickPickItem[] = [];
			items.push({ label: 'Yes', description: 'Delete README.md?' });
			items.push({ label: 'No', description: 'Do not delete README.md' });

			vscode.window.showQuickPick(items, { title: 'README.md File', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				dirfuncs.delFile(readMe.fsPath);
				vscode.commands.executeCommand('analyzerView.refreshAll');
			});
		} else {
			vscode.window.showWarningMessage('README.md does not exist');
		}
	}

	editReadMe(analyzerItem: AnalyzerItem) {
		let dirPath = analyzerItem.uri.fsPath;
		if (!dirfuncs.isDir(dirPath)) {
			dirPath = path.dirname(analyzerItem.uri.fsPath);
		}
		const readMe = path.join(dirPath, "README.md");
		if (!fs.existsSync(readMe)) {
			const content = "# TITLE\n\nDescription here.";
			dirfuncs.writeFile(readMe, content);
		}
		vscode.window.showTextDocument(vscode.Uri.file(readMe));
		vscode.commands.executeCommand('analyzerView.refreshAll');
	}

	readMe(analyzerItem: AnalyzerItem) {
		const readMe = vscode.Uri.file(path.join(analyzerItem.uri.fsPath, "README.md"));
		if (fs.existsSync(readMe.fsPath)) {
			vscode.commands.executeCommand("markdown.showPreview", readMe);
		}
	}

	moveUp(analyzerItem: AnalyzerItem) {
		let parent = path.dirname(analyzerItem.uri.fsPath);
		const analyzersFolder = visualText.getAnalyzerDir();
		if (parent != analyzersFolder.fsPath) {
			parent = path.dirname(parent);
			const to = path.join(parent, path.basename(analyzerItem.uri.fsPath));
			dirfuncs.rename(analyzerItem.uri.fsPath, to);
			vscode.commands.executeCommand('analyzerView.refreshAll');
		} else {
			vscode.window.showInformationMessage('Already at the top');
		}
	}

	explore(analyzerItem: AnalyzerItem) {
		if (fs.existsSync(analyzerItem.uri.fsPath)) {
			visualText.openFileManager(analyzerItem.uri.fsPath);
		}
	}

	exploreAll() {
		const dir = visualText.getAnalyzerDir();
		if (fs.existsSync(dir.fsPath)) {
			visualText.openFileManager(dir.fsPath);
		}
	}

	copyAll() {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Analyzers to here',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: false,
				canSelectFolders: true
			};
			vscode.window.showOpenDialog(options).then(selection => {
				if (!selection) {
					return;
				}
				const analyzers = visualText.getAnalyzers(false);
				const toFolder = vscode.Uri.file(selection[0].fsPath);
				for (const analyzer of analyzers) {
					const folder = path.basename(analyzer.fsPath);
					visualText.fileOps.addFileOperation(analyzer, vscode.Uri.file(path.join(toFolder.fsPath, folder)), [fileOpRefresh.UNKNOWN], fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();
			});
		}
	}

	copyAnalyzer(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: false,
				openLabel: 'Folder to copy to',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: false,
				canSelectFolders: true
			};
			vscode.window.showOpenDialog(options).then(selection => {
				if (!selection) {
					return;
				}
				const folder = path.basename(analyzerItem.uri.fsPath);
				visualText.fileOps.addFileOperation(analyzerItem.uri, vscode.Uri.file(path.join(selection[0].fsPath, folder)), [fileOpRefresh.UNKNOWN], fileOperation.COPY);
				visualText.fileOps.startFileOps();
			});
		}
	}

	dupeAnalyzer(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(analyzerItem.uri.fsPath), prompt: 'Enter duplicate analyzer name' }).then(newname => {
				if (newname) {
					const folder = path.dirname(analyzerItem.uri.fsPath);
					visualText.fileOps.addFileOperation(analyzerItem.uri, vscode.Uri.file(path.join(folder, newname)), [fileOpRefresh.ANALYZERS], fileOperation.COPY);
					visualText.fileOps.startFileOps();
					vscode.commands.executeCommand('analyzerView.refreshAll');
					vscode.commands.executeCommand('sequenceView.refreshAll');
				}
			});
		}
	}

	private updateTitle(uri: vscode.Uri): void {
		if (uri.fsPath.length > 0) {
			this.chosen = uri;
			const anaChosen = path.basename(uri.fsPath);
			if (anaChosen.length)
				this.analyzerView.title = `ANALYZERS (${anaChosen})`;
		} else {
			this.chosen = undefined;
			this.analyzerView.title = 'ANALYZERS';
		}
		vscode.commands.executeCommand('sequenceView.updateTitle');
	}

	private openAnalyzer(analyzerItem: AnalyzerItem): void {
		visualText.colorizeAnalyzer();
		if (analyzerItem.type == analyzerItemType.ANALYZER) {
			visualText.loadAnalyzer(analyzerItem.uri);
			this.folderUri = undefined;
		} else {
			this.folderUri = analyzerItem.uri;
		}
	}

	private deleteAnalyzer(analyzerItem: AnalyzerItem): void {
		if (visualText.hasWorkspaceFolder()) {
			const items: vscode.QuickPickItem[] = [];
			let deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete \'', path.basename(analyzerItem.uri.fsPath), '\' Analyzer');
			items.push({ label: 'Yes', description: deleteDescr });
			items.push({ label: 'No', description: 'Do not delete analyzer' });

			vscode.window.showQuickPick(items, { title: 'Delete Analyzer', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(analyzerItem.uri, analyzerItem.uri, [fileOpRefresh.TEXT, fileOpRefresh.KB, fileOpRefresh.ANALYZERS, fileOpRefresh.ANALYZER], fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	private deleteFile(analyzerItem: AnalyzerItem): void {
		if (visualText.hasWorkspaceFolder()) {
			const items: vscode.QuickPickItem[] = [];
			let deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete file \'', path.basename(analyzerItem.uri.fsPath));
			items.push({ label: 'Yes', description: deleteDescr });
			items.push({ label: 'No', description: 'Do not delete file' });

			vscode.window.showQuickPick(items, { title: 'Delete File', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(analyzerItem.uri, analyzerItem.uri, [fileOpRefresh.ANALYZERS], fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	private deleteFolder(analyzerItem: AnalyzerItem): void {
		if (visualText.hasWorkspaceFolder()) {
			const itemCount = fs.readdirSync(analyzerItem.uri.fsPath).length;
			let yesDescr = '';
			let noDescr = '';
			let placeDescr = 'Choose Yes of No';
			yesDescr = yesDescr.concat('Delete empty folder \'', path.basename(analyzerItem.uri.fsPath), '\'');
			noDescr = 'Do not delete empty folder';
			if (fs.readdirSync(analyzerItem.uri.fsPath).length != 0) {
				yesDescr = `FOLDER NOT EMPTY: Delete folder and its ${itemCount} items?`;
				noDescr = 'Do not delete folder and all its contents';
				placeDescr = 'FOLDER NOT EMPTY: choose yes or no';
			}
			const items: vscode.QuickPickItem[] = [];
			items.push({ label: 'Yes', description: yesDescr });
			items.push({ label: 'No', description: noDescr });

			vscode.window.showQuickPick(items, { title: 'Delete Folder', canPickMany: false, placeHolder: placeDescr }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(analyzerItem.uri, analyzerItem.uri, [fileOpRefresh.ANALYZERS], fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	private loadExampleAnalyzers() {
		this.openFolder(visualText.getBlockAnalyzersPath());
	}

	private newAnalyzer(analyzerItem: AnalyzerItem) {
		let uri: vscode.Uri;
		if (analyzerItem == undefined) {
			uri = visualText.getAnalyzerDir();
		} else {
			uri = analyzerItem.uri;
			if (analyzerItem.type == analyzerItemType.ANALYZER)
				uri = vscode.Uri.file(path.dirname(uri.fsPath));
		}
		visualText.analyzer.newAnalyzer(uri);
	}

	public deleteAllAnalyzerLogs() {
		if (visualText.hasWorkspaceFolder()) {

			const items: vscode.QuickPickItem[] = [];
			let deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete log directories for all analyzers?');
			items.push({ label: 'Yes', description: deleteDescr });
			items.push({ label: 'No', description: 'Do not delete analyzers log files' });

			vscode.window.showQuickPick(items, { title: 'Delete ALL Analyzer Logs', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				this.deleteAllAnalyzerLogDirs();
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteAnalyzerLogs(analyzerItem: AnalyzerItem) {
		if (visualText.hasWorkspaceFolder()) {
			const items: vscode.QuickPickItem[] = [];
			let deleteDescr = '';
			const analyzerName = path.basename(analyzerItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete log directories for \'', analyzerName, '\'?');
			items.push({ label: 'Yes', description: deleteDescr });
			items.push({ label: 'No', description: 'Do not delete analyzer log files' });

			vscode.window.showQuickPick(items, { title: 'Delete Analyzer', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;

				textView.deleteFolderLogs(analyzerItem.uri);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteLogDirs(dir: vscode.Uri) {
		const outputDir = vscode.Uri.file(path.join(dir.fsPath, "output"));
		this.deleteDirFiles(outputDir);
		const logDir = vscode.Uri.file(path.join(dir.fsPath, "logs"));
		this.deleteDirFiles(logDir);
	}

	public deleteDirFiles(dir: vscode.Uri) {
		const files = dirfuncs.getFiles(dir);
		for (const file of files) {
			visualText.fileOps.addFileOperation(file, file, [fileOpRefresh.ANALYZERS], fileOperation.DELETE);
		}
	}

	public deleteAllAnalyzerLogDirs() {
		if (vscode.workspace.workspaceFolders) {
			const analyzerUris = visualText.getAnalyzers(true);
			for (const analyzerUri of analyzerUris) {
				const analyzerName = path.basename(analyzerUri.fsPath);
				textView.deleteFolderLogs(analyzerUri);
			}
		}
	}
}
