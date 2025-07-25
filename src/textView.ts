import * as vscode from 'vscode';
import * as path from 'path';
import { visualText, closeFileIfOpen } from './visualText';
import { NLPFile, analyzerType } from './nlp';
import { FindFile } from './findFile';
import { findView } from './findView';
import { dirfuncs } from './dirfuncs';
import { nlpStatusBar, DevMode, FiredMode } from './status';
import { fileOperation, fileOpRefresh } from './fileOps';
import { anaSubDir } from './analyzer';
import * as fs from 'fs';
import * as moment from 'moment';
import 'moment-duration-format'

export interface TextItem {
	uri: vscode.Uri;
	type: vscode.FileType;
	hasLogs: boolean;
	hasNonText: boolean;
	moveUp: boolean;
	moveDown: boolean;
}

export class FileSystemProvider implements vscode.TreeDataProvider<TextItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<TextItem | undefined | null | void> = new vscode.EventEmitter<TextItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<TextItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() { }

	async getChildren(textItem?: TextItem): Promise<TextItem[]> {
		if (textItem) {
			return this.getKeepers(textItem.uri);
		}
		if (visualText.hasWorkspaceFolder() && visualText.hasAnalyzers() && visualText.analyzer.isLoaded()) {
			return this.getKeepers(visualText.analyzer.getInputDirectory());
		}
		return [];
	}

	getMovement(textItem: TextItem) {
		textItem.moveDown = false;
		textItem.moveUp = false;
		const itemPath = textItem.uri.fsPath;
		const parent = path.dirname(itemPath);
		const inputPath = visualText.analyzer.getInputDirectory().fsPath;

		if (parent != inputPath) {
			textItem.moveUp = true;
		}
		if (textItem.type == vscode.FileType.Directory) {
			if (dirfuncs.parentHasOtherDirs(textItem.uri)) {
				textItem.moveDown = true;
			}
		} else if (dirfuncs.parentHasOtherDirs(vscode.Uri.file(itemPath))) {
			textItem.moveDown = true;
		}
	}

	getTreeItem(textItem: TextItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(textItem.uri, textItem.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		if (!visualText.getTextFastLoad())
			this.getMovement(textItem);
		let conVal = textItem.moveDown ? 'moveDown' : '';
		if (textItem.moveUp)
			conVal = conVal + 'moveUp';
		const hasLogs = textItem.hasLogs ? 'HasLogs' : '';
		let hasTest = '';

		if (textItem.type === vscode.FileType.File) {
			const testFolder = visualText.analyzer.testFolder(textItem.uri).fsPath;
			if (fs.existsSync(testFolder))
				hasTest = 'test';

			treeItem.command = { command: 'textView.openFile', title: "Open File", arguments: [textItem], };
			treeItem.contextValue = 'file' + conVal + hasLogs + hasTest;
			//treeItem.tooltip = treeItem.contextValue;
			if (textItem.uri.fsPath.endsWith('.py')) {
				treeItem.iconPath = {
					light: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'light', 'python.svg')),
					dark: vscode.Uri.file(path.join(__filename, '..', '..', 'resources', 'dark', 'python.svg'))
				}
			} else {
				treeItem.iconPath = {
					light: vscode.Uri.file(textItem.hasLogs ?
						hasTest ? path.join(__filename, '..', '..', 'resources', 'light', 'document-test.svg') : path.join(__filename, '..', '..', 'resources', 'light', 'document.svg') :
						hasTest ? path.join(__filename, '..', '..', 'resources', 'light', 'file-test.svg') : path.join(__filename, '..', '..', 'resources', 'light', 'file.svg')),
					dark: vscode.Uri.file(textItem.hasLogs ?
						hasTest ? path.join(__filename, '..', '..', 'resources', 'dark', 'document-test.svg') : path.join(__filename, '..', '..', 'resources', 'dark', 'document.svg') :
						hasTest ? path.join(__filename, '..', '..', 'resources', 'dark', 'file-test.svg') : path.join(__filename, '..', '..', 'resources', 'dark', 'file.svg')),
				}
			}

		} else {
			if (!visualText.getAutoUpdate()) {
				if (visualText.analyzer.folderHasTests(textItem.uri))
					hasTest = 'test';
			}

			const hasNonText = textItem.hasNonText ? 'HasNonText' : '';
			treeItem.command = { command: 'textView.openFile', title: "Open File", arguments: [textItem], };
			treeItem.contextValue = 'dir' + conVal + hasNonText + hasLogs + hasTest;
			//treeItem.tooltip = treeItem.contextValue;
			treeItem.iconPath = {
				light: vscode.Uri.file(hasTest ? path.join(__filename, '..', '..', 'resources', 'dark', 'folder-test.svg') : path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg')),
				dark: vscode.Uri.file(hasTest ? path.join(__filename, '..', '..', 'resources', 'dark', 'folder-test.svg') : path.join(__filename, '..', '..', 'resources', 'dark', 'folder.svg')),
			}
		}

		return treeItem;
	}

	getKeepers(dir: vscode.Uri): TextItem[] {
		// this.checkFileCount(dir.fsPath);
		let keepers = Array();
		const entries = dirfuncs.getDirectoryTypes(dir);

		const startTime = moment();

		for (const entry of entries) {
			if (!entry.uri.fsPath.endsWith(visualText.TEST_SUFFIX) && !(entry.type == vscode.FileType.Directory && dirfuncs.directoryIsLog(entry.uri.fsPath))) {
				let hasLogs = false;
				let hasNonText = false;
				if (!visualText.getTextFastLoad()) {
					hasLogs = dirfuncs.hasLogDirs(entry.uri, false);
					hasNonText = entry.type == vscode.FileType.Directory && this.dirHasNonText(entry.uri) ? true : false;
				}
				keepers.push({ uri: entry.uri, type: entry.type, hasLogs: hasLogs, hasNonText: hasNonText, moveUp: false, moveDown: false });
			}
		}

		let hasAllLogs = false;
		if (!visualText.getTextFastLoad())
			hasAllLogs = dirfuncs.hasLogDirs(dir, true);
		vscode.commands.executeCommand('setContext', 'text.hasLogs', false);

		if (visualText.getTextFastLoad()) {
			const endTime = moment();
			const timeDiff = moment.duration(endTime.diff(startTime), 'milliseconds').format('mm:ss:SS');
			visualText.debugMessage(`TextView loading: ${timeDiff} (m:s:ms)`);
		}

		return keepers;
	}

	checkFileCount(dir: string) {
		const count = dirfuncs.fileCount(visualText.analyzer.getInputDirectory());
		if (!visualText.fastAnswered && count > 100 && !visualText.getTextFastLoad()) {
			const items: vscode.QuickPickItem[] = [];
			const offMsg = 'Turn On Fast Text Load';
			items.push({ label: offMsg, description: 'files will not have attributes such as \'has log files\'' });
			items.push({ label: 'Leave Fast Load Off', description: 'please generate all the file attributes' });

			vscode.window.showQuickPick(items, { title: 'Fast Load Toggle', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (selection != undefined) {
					if (selection.label == 'Turn On Fast Text Load')
						visualText.setTextFastLoad(true);
				}
			});
			visualText.fastAnswered = true;
		}
	}

	dirHasNonText(dir: vscode.Uri): boolean {
		const files = dirfuncs.getFiles(dir);
		for (const file of files) {
			if (!file.fsPath.endsWith('.txt'))
				return true;
		}
		return false;
	}

	importFiles(textItem: TextItem) {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: true,
				openLabel: 'Import Existing File(s)',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: true,
				canSelectFolders: false,
				filters: {
					'Text files': ['txt', 'xml', 'html', 'csv'],
					'All files': ['*']
				}
			};

			vscode.window.showOpenDialog(options).then(selections => {
				if (!selections) {
					return;
				}
				let dir = visualText.analyzer.getInputDirectory().fsPath;
				if (textItem) {
					dir = textItem.uri.fsPath;
					if (textItem.type == vscode.FileType.File) {
						dir = path.dirname(textItem.uri.fsPath);
					}
				}
				for (const sel of selections) {
					const filename = path.basename(sel.fsPath);
					const newPath = vscode.Uri.file(path.join(dir, filename));
					visualText.fileOps.addFileOperation(sel, newPath, [fileOpRefresh.TEXT], fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();
			});
		}
	}

	existingFolder(textItem: TextItem) {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: true,
				openLabel: 'Add Existing Folder(s)',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: false,
				canSelectFolders: true,
			};

			vscode.window.showOpenDialog(options).then(selections => {
				if (!selections) {
					return;
				}
				for (const sel of selections) {
					const dirname = path.basename(sel.fsPath);
					let dir = visualText.analyzer.getInputDirectory().fsPath;
					if (textItem) {
						dir = path.dirname(textItem.uri.fsPath);
					}
					const newPath = vscode.Uri.file(path.join(dir, dirname));
					visualText.fileOps.addFileOperation(sel, newPath, [fileOpRefresh.TEXT], fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();
			});
		}
	}

	rename(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(textItem.uri.fsPath), prompt: 'Enter new name for file' }).then(newname => {
				if (newname) {
					const original = textItem.uri;
					if (path.extname(newname).length == 0)
						newname = newname + path.extname(textItem.uri.fsPath);
					const newfile = vscode.Uri.file(path.join(path.dirname(textItem.uri.fsPath), newname));
					dirfuncs.rename(original.fsPath, newfile.fsPath);
					vscode.window.showTextDocument(newfile);

					const logFolderOrig = vscode.Uri.file(path.join(original.fsPath + visualText.LOG_SUFFIX));
					if (dirfuncs.isDir(logFolderOrig.fsPath)) {
						const logFolderNew = vscode.Uri.file(path.join(path.dirname(textItem.uri.fsPath), newname + visualText.LOG_SUFFIX));
						dirfuncs.rename(logFolderOrig.fsPath, logFolderNew.fsPath);
					}
					vscode.commands.executeCommand('textView.refreshAll');
				}
			});
		}
	}

	renameDir(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(textItem.uri.fsPath), prompt: 'Enter new name for directory' }).then(newname => {
				if (newname) {
					const original = textItem.uri;
					const newfile = vscode.Uri.file(path.join(path.dirname(textItem.uri.fsPath), newname));
					dirfuncs.rename(original.fsPath, newfile.fsPath);
					vscode.commands.executeCommand('textView.refreshAll');
				}
			});
		}
	}

	convert(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			visualText.fileOps.addFileOperation(textItem.uri, textItem.uri, [fileOpRefresh.TEXT], fileOperation.RENAME, '', 'txt');
			visualText.fileOps.startFileOps(100);
		}
	}
}

export let textView: TextView;
export class TextView {

	private textView: vscode.TreeView<TextItem>;
	private findFile = new FindFile();
	public folderUri: vscode.Uri | undefined;

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new FileSystemProvider();
		this.textView = vscode.window.createTreeView('textView', { treeDataProvider });
		vscode.commands.registerCommand('textView.refreshAll', () => treeDataProvider.refresh());
		vscode.commands.registerCommand('textView.importFiles', (textItem) => treeDataProvider.importFiles(textItem));
		vscode.commands.registerCommand('textView.existingFolder', (textItem) => treeDataProvider.existingFolder(textItem));
		vscode.commands.registerCommand('textView.rename', (textItem) => treeDataProvider.rename(textItem));
		vscode.commands.registerCommand('textView.renameDir', (textItem) => treeDataProvider.renameDir(textItem));
		vscode.commands.registerCommand('textView.convert', (textItem) => treeDataProvider.convert(textItem));

		vscode.commands.registerCommand('textView.openFile', (textItem) => this.openFile(textItem));
		vscode.commands.registerCommand('textView.analyzerCurrent', () => this.analyzerCurrent());
		vscode.commands.registerCommand('textView.analyze', (textItem) => this.analyze(textItem));
		vscode.commands.registerCommand('textView.analyzeDir', (textItem) => this.analyzeDir(textItem));
		vscode.commands.registerCommand('textView.openText', () => this.openText());
		vscode.commands.registerCommand('textView.search', () => this.search());
		vscode.commands.registerCommand('textView.fastLoad', () => this.fastLoad(true));
		vscode.commands.registerCommand('textView.fastLoadOff', () => this.fastLoad(false));
		vscode.commands.registerCommand('textView.newTextTop', (textItem) => this.newText(textItem, true));
		vscode.commands.registerCommand('textView.newText', (textItem) => this.newText(textItem, false));
		vscode.commands.registerCommand('textView.newDirTop', (textItem) => this.newDir(textItem, true));
		vscode.commands.registerCommand('textView.newDir', (textItem) => this.newDir(textItem, false));
		vscode.commands.registerCommand('textView.deleteFile', (textItem) => this.deleteFile(textItem));
		vscode.commands.registerCommand('textView.deleteDir', (textItem) => this.deleteFile(textItem));
		vscode.commands.registerCommand('textView.deleteFileLogs', (textItem) => this.deleteFileLogs(textItem));
		vscode.commands.registerCommand('textView.deleteAnalyzerLogs', () => this.deleteAnalyzerLogs());
		vscode.commands.registerCommand('textView.splitDir', (textItem) => this.splitDir(textItem));
		vscode.commands.registerCommand('textView.updateTitle', (textItem) => this.updateTitle(textItem));
		vscode.commands.registerCommand('textView.propertiesFile', (textItem) => this.propertiesFile(textItem));
		vscode.commands.registerCommand('textView.propertiesFolder', (textItem) => this.propertiesFolder(textItem));
		vscode.commands.registerCommand('textView.explore', (textItem) => this.explore(textItem));
		vscode.commands.registerCommand('textView.exploreAll', (textItem) => this.exploreAll(textItem));
		vscode.commands.registerCommand('textView.moveToFolder', (textItem) => this.moveToFolder(textItem));
		vscode.commands.registerCommand('textView.moveUp', (textItem) => this.moveUp(textItem));
		vscode.commands.registerCommand('textView.copyToAnalyzer', (textItem) => this.copyToAnalyzer(textItem));
		vscode.commands.registerCommand('textView.modAdd', (textItem) => this.modAdd(textItem));
		vscode.commands.registerCommand('textView.runTest', (textItem) => this.runTest(textItem));
		vscode.commands.registerCommand('textView.deleteTest', (textItem) => this.deleteTest(textItem));
		vscode.commands.registerCommand('textView.editTest', (textItem) => this.editTest(textItem));
		vscode.commands.registerCommand('textView.python', (textItem) => this.python(textItem));

		this.folderUri = undefined;
	}

	static attach(ctx: vscode.ExtensionContext) {
		if (!textView) {
			textView = new TextView(ctx);
		}
		return textView;
	}

	async python(textItem: TextItem) {
		if (visualText.hasWorkspaceFolder()) {
			const textFilePath = path.dirname(textItem.uri.fsPath);
			const items: vscode.QuickPickItem[] = await visualText.chooseLibFiles('Choose python scripts', 'python', '', [".py"]);
			for (const item of items) {
				if (item.description) {
					const original = vscode.Uri.file(path.join(item.description, item.label));
					const newFile = vscode.Uri.file(path.join(textFilePath, item.label));
					visualText.fileOps.addFileOperation(original, newFile, [fileOpRefresh.TEXT], fileOperation.COPY);
				}
			}
			visualText.fileOps.startFileOps();
		}
	}

	fastLoad(fastFlag: boolean = false) {
		visualText.setTextFastLoad(fastFlag);
		vscode.commands.executeCommand('setContext', 'textView.fastload', fastFlag);
	}

	editTest(textItem: TextItem) {
		if (visualText.getWorkspaceFolder()) {
			visualText.editTestFiles(textItem.uri);
		}
	}

	deleteTest(textItem: TextItem) {
		const items: vscode.QuickPickItem[] = [];
		items.push({ label: 'Yes', description: 'Delete all the test files associated with this test' });
		items.push({ label: 'No', description: 'Do not delete the test files' });

		vscode.window.showQuickPick(items, { title: 'Delete Test Files', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
			if (!selection || selection.label == 'No')
				return;
			const testFolder = visualText.analyzer.testFolder(textItem.uri);
			visualText.fileOps.addFileOperation(testFolder, testFolder, [fileOpRefresh.TEXT, fileOpRefresh.OUTPUT], fileOperation.DELETE);
			visualText.fileOps.startFileOps();
		});
	}

	runTest(textItem: TextItem) {
		visualText.testInit();
		if (dirfuncs.isDir(textItem.uri.fsPath)) {
			const files = dirfuncs.getFiles(textItem.uri);
			if (files.length)
				dirfuncs.delFile(visualText.regressionTestFile());
			for (const file of files) {
				if (visualText.analyzer.fileHasTests(file))
					visualText.runTest(file);
			}
		} else {
			dirfuncs.delFile(visualText.regressionTestFile());
			visualText.runTest(textItem.uri);
		}
		visualText.closeTest();
		vscode.window.showTextDocument(vscode.Uri.file(visualText.regressionTestFile()));
		vscode.commands.executeCommand('kbView.refreshAll');
	}

	modAdd(textItem: TextItem): void {
		visualText.mod.addFile(textItem.uri, true);
	}

	copyToAnalyzer(textItem: TextItem) {
		if (visualText.getWorkspaceFolder()) {
			const dirs = dirfuncs.getDirectories(visualText.getWorkspaceFolder());
			const items: vscode.QuickPickItem[] = visualText.analyzerFolderList();
			const title = 'Copy to Analyzer';
			const placeHolder = 'Choose analyzer to copy to';

			vscode.window.showQuickPick(items, { title, canPickMany: false, placeHolder: placeHolder }).then(selection => {
				if (!selection || !selection.description)
					return;
				if (selection.description.startsWith('(FOLDER')) {
					vscode.window.showWarningMessage('You must select an analyzer directory not a folder');
					return;
				}
				const subDir = visualText.analyzer.anaSubDirPath(anaSubDir.INPUT);
				if (dirfuncs.isDir(textItem.uri.fsPath)) {
					const newFolder = vscode.Uri.file(path.join(selection.description, subDir, path.basename(textItem.uri.fsPath)));
					visualText.fileOps.addFileOperation(textItem.uri, newFolder, [fileOpRefresh.TEXT], fileOperation.COPY);
				} else {
					const newFile = vscode.Uri.file(path.join(selection.description, subDir, path.basename(textItem.uri.fsPath)));
					visualText.fileOps.addFileOperation(textItem.uri, newFile, [fileOpRefresh.TEXT], fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();
			});
		}
	}

	moveToFolder(textItem: TextItem) {
		if (this.folderUri) {
			const to = path.join(this.folderUri.fsPath, path.basename(textItem.uri.fsPath));
			this.moveFileWithFolders(textItem.uri.fsPath, to);
			vscode.commands.executeCommand('textView.refreshAll');
		} else {
			vscode.window.showInformationMessage('No folder selected');
		}
	}

	moveUp(textItem: TextItem) {
		let parent = path.dirname(textItem.uri.fsPath);
		const analyzersFolder = visualText.analyzer.getInputDirectory();
		if (parent != analyzersFolder.fsPath) {
			parent = path.dirname(parent);
			const to = path.join(parent, path.basename(textItem.uri.fsPath));
			this.moveFileWithFolders(textItem.uri.fsPath, to);
			vscode.commands.executeCommand('textView.refreshAll');
		} else {
			vscode.window.showInformationMessage('Already at the top');
		}
	}

	moveFileWithFolders(from: string, to: string) {
		dirfuncs.rename(from, to);
		if (!dirfuncs.isDir(from)) {
			const outputFolder = from + visualText.LOG_SUFFIX;
			if (fs.existsSync(outputFolder)) {
				const toFolder = to + visualText.LOG_SUFFIX;
				dirfuncs.rename(outputFolder, toFolder);
			}
			const testFolder = from + visualText.TEST_SUFFIX;
			if (fs.existsSync(testFolder)) {
				const toFolder = to + visualText.TEST_SUFFIX;
				dirfuncs.rename(testFolder, toFolder);
			}
		}
	}

	explore(textItem: TextItem) {
		if (textItem.uri.fsPath.length) {
			let pather = textItem.uri.fsPath;
			if (!dirfuncs.isDir(pather))
				pather = path.dirname(pather);
			visualText.openFileManager(pather);
		}
	}

	exploreAll(textItem: TextItem) {
		const inputDir = visualText.analyzer.getInputDirectory().fsPath;
		if (fs.existsSync(inputDir)) {
			visualText.openFileManager(inputDir);
		}
	}

	analyze(textItem: TextItem) {
		if (textItem.uri.fsPath.length) {
			// visualText.nlp.addAnalyzer(textItem.uri,analyzerType.FILE);
			// visualText.nlp.startAnalyzer();
			const nlp = new NLPFile();
			nlp.analyze(textItem.uri);
		}
	}

	private analyzerCurrent() {
		if (visualText.analyzer.hasText()) {
			const textUri = visualText.analyzer.getTextPath();
			this.openFile({ uri: textUri, type: vscode.FileType.File, hasLogs: false, hasNonText: false, moveUp: false, moveDown: false });
			const nlp = new NLPFile();
			nlp.analyze(textUri);
		}
	}

	propertiesFile(textItem: TextItem) {
		fs.stat(textItem.uri.fsPath, (err, stats) => {
			if (err) {
				vscode.window.showInformationMessage('File read error: ' + err);
			} else {
				const sizeStr = this.humanFileSize(stats.size, true, 1);
				const base = path.basename(textItem.uri.fsPath);
				vscode.window.showInformationMessage(base + ": " + sizeStr);
			}
		});
	}

	propertiesFolder(textItem: TextItem) {
		const files = dirfuncs.getFiles(textItem.uri);
		const len: number = files.length;
		const base = path.basename(textItem.uri.fsPath);
		vscode.window.showInformationMessage(base + ": " + len + " files");
	}

	humanFileSize(bytes: number, si: boolean, dp: number): string {
		const thresh = si ? 1000 : 1024;

		if (Math.abs(bytes) < thresh) {
			return bytes + ' B';
		}

		const units = si
			? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
			: ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
		let u = -1;
		const r = 10 ** dp;

		do {
			bytes /= thresh;
			++u;
		} while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


		return bytes.toFixed(dp) + ' ' + units[u];
	}

	analyzeDir(textItem: TextItem) {
		if (textItem.uri.fsPath.length) {
			const items: vscode.QuickPickItem[] = [];
			const foldername = path.basename(textItem.uri.fsPath);
			let msg = '';
			msg = msg.concat('Analyze all files in folder \'', foldername, '\'?');

			if (nlpStatusBar.getDevMode() == DevMode.DEV) {
				const fileCount = dirfuncs.fileCount(textItem.uri);
				if (fileCount > 10) {
					const items: vscode.QuickPickItem[] = [];
					const offMsg = 'Turn Off Logs';
					items.push({ label: offMsg, description: fileCount + ' files will be analyzed, each will generate logs' });
					items.push({ label: 'Leave Logs On', description: 'please generate all the logs' });

					vscode.window.showQuickPick(items, { title: 'Logs Toggle', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
						if (!selection) {
							textView.askAnalyzeFolder(textItem);
							return;
						}
						nlpStatusBar.setDevState(selection.label == offMsg ? DevMode.NORMAL : DevMode.DEV);
						nlpStatusBar.updateFiredState();
						textView.askAnalyzeFolder(textItem);
					});
				} else {
					textView.askAnalyzeFolder(textItem);
				}
			} else {
				textView.askAnalyzeFolder(textItem);
			}
		}
	}

	askAnalyzeFolder(textItem: TextItem) {
		const items: vscode.QuickPickItem[] = [];
		const foldername = path.basename(textItem.uri.fsPath);
		let msg = '';
		msg = msg.concat('Analyze all files in folder \'', foldername, '\'?');
		items.push({ label: 'Yes', description: msg });
		items.push({ label: 'No', description: 'Do not analyze folder \'' + foldername + '\'' });

		vscode.window.showQuickPick(items, { title: 'Analyzer Folders', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
			if (!selection || selection.label == 'No')
				return;
			visualText.nlp.addAnalyzer(textItem.uri, analyzerType.DIRECTORY);
			visualText.nlp.startAnalyzer();
		});
	}

	search() {
		if (visualText.hasWorkspaceFolder()) {
			if (visualText.hasWorkspaceFolder()) {
				vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
					if (searchWord) {
						this.findFile.searchFiles(visualText.analyzer.getInputDirectory(), searchWord, []);
						findView.loadFinds(searchWord, this.findFile.getMatches());
						vscode.commands.executeCommand('findView.updateTitle');
						vscode.commands.executeCommand('findView.refreshAll');
					}
				});
			}
		}
	}

	private openText() {
		if (visualText.analyzer.hasText()) {
			vscode.window.showTextDocument(visualText.analyzer.getTextPath());
			vscode.commands.executeCommand('status.update');
		}
	}

	private updateTitle(resource: vscode.Uri): void {
		const filepath = resource.fsPath;
		if (resource && filepath.length) {
			const filename = path.basename(resource.fsPath);
			if (filename.length) {
				this.textView.title = `TEXT (${filename})`;
				return;
			}
		}
		this.textView.title = 'TEXT';
	}

	private openFile(textItem: TextItem): void {
		this.updateTitle(textItem.uri);
		visualText.colorizeAnalyzer();
		if (textItem.type == vscode.FileType.File) {
			this.folderUri = undefined;
			vscode.window.showTextDocument(textItem.uri);
			visualText.analyzer.saveCurrentFile(textItem.uri);
			vscode.commands.executeCommand('outputView.refreshAll');
			vscode.commands.executeCommand('status.update');
		} else {
			this.folderUri = textItem.uri;
		}
	}

	private deleteFile(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			const items: vscode.QuickPickItem[] = [];
			let deleteDescr = '';
			const filename = path.basename(textItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete \'', filename, '\'?');
			items.push({ label: 'Yes', description: deleteDescr });
			items.push({ label: 'No', description: 'Do not delete ' + filename });

			vscode.window.showQuickPick(items, { title: 'Delete File', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(textItem.uri, textItem.uri, [fileOpRefresh.TEXT], fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteFileOrFolderLogs(textItem: TextItem) {
		if (visualText.hasWorkspaceFolder()) {
			if (dirfuncs.isDir(textItem.uri.fsPath)) {
				this.deleteFolderLogs(textItem.uri);
			} else {
				this.deleteFileLogDir(textItem.uri.fsPath);
			}
		}
	}

	public deleteFileLogs(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			const items: vscode.QuickPickItem[] = [];
			let deleteDescr = '';
			const filename = path.basename(textItem.uri.fsPath);
			const type = dirfuncs.isDir(textItem.uri.fsPath) ? 'directory' : 'file';
			deleteDescr = deleteDescr.concat('Delete logs for ', type, ' \'', filename, '\'?');
			items.push({ label: 'Yes', description: deleteDescr });
			items.push({ label: 'No', description: 'Do not delete logs for ' + filename });

			vscode.window.showQuickPick(items, { title: 'Delete File Logs', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				this.deleteFileOrFolderLogs(textItem);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteFolderFileLogs(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			const items: vscode.QuickPickItem[] = [];
			let deleteDescr = '';
			const filename = path.basename(textItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete logs for \'', filename, '\'?');
			items.push({ label: 'Yes', description: deleteDescr });
			items.push({ label: 'No', description: 'Do not delete logs for ' + filename });

			vscode.window.showQuickPick(items, { title: 'Delete Folder File Logs', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				this.deleteFolderLogs(textItem.uri);
				visualText.fileOps.startFileOps();
			});
		}
	}

	public deleteFolderLogs(dir: vscode.Uri) {
		const analyzerName = path.basename(dir.fsPath);
		const logDirs: TextItem[] = Array();
		textView.getLogDirs(dir, logDirs, false);
		const count = logDirs.length;

		if (count) {
			for (const dir of logDirs) {
				visualText.fileOps.addFileOperation(dir.uri, dir.uri, [fileOpRefresh.TEXT, fileOpRefresh.ANALYZER, fileOpRefresh.ANALYZERS, fileOpRefresh.OUTPUT], fileOperation.DELETE);
			};
		}
	}

	public deleteFileLogDir(dirPath: string): void {
		const logPath = vscode.Uri.file(dirPath + visualText.LOG_SUFFIX);
		visualText.fileOps.addFileOperation(logPath, logPath, [fileOpRefresh.TEXT, fileOpRefresh.ANALYZER, fileOpRefresh.ANALYZERS, fileOpRefresh.OUTPUT], fileOperation.DELETE);
	}

	public deleteAnalyzerLogs(): void {
		if (visualText.hasWorkspaceFolder() && visualText.analyzer.hasText()) {
			const items: vscode.QuickPickItem[] = [];
			let deleteDescr = '';
			deleteDescr = deleteDescr.concat('Delete all logs for this Analyzer?');
			items.push({ label: 'Yes', description: deleteDescr });
			items.push({ label: 'No', description: 'Do not delete all logs for this Analyzer' });

			vscode.window.showQuickPick(items, { title: 'Delete Analyzer Logs', canPickMany: false, placeHolder: 'Choose Yes or No' }).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				const inputPath = visualText.analyzer.getInputDirectory();
				if (inputPath.fsPath.length) {
					this.deleteFolderLogs(inputPath);
					visualText.fileOps.startFileOps();
				}
			});
		}
	}

	public splitDir(textItem: TextItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: "3000", prompt: 'Enter number of files per directory' }).then(numFiles => {
				if (numFiles) {
					visualText.fileOps.addFileOperation(textItem.uri, vscode.Uri.file(''), [fileOpRefresh.TEXT], fileOperation.BREAK, numFiles.toString());
					visualText.fileOps.startFileOps(0);
				}
			});
		}
	}

	public getLogDirs(dir: vscode.Uri, logDirs: TextItem[], first: boolean) {
		const inputDir = first ? visualText.analyzer.getInputDirectory() : dir;
		const entries = dirfuncs.getDirectoryTypes(inputDir);

		for (const entry of entries) {
			if (entry.type == vscode.FileType.Directory) {
				const name = path.basename(entry.uri.fsPath);
				if (dirfuncs.directoryIsLog(entry.uri.fsPath) || name == 'logs' || name == 'output')
					logDirs.push({ uri: entry.uri, type: entry.type, hasLogs: false, hasNonText: false, moveUp: false, moveDown: false });
				else
					this.getLogDirs(entry.uri, logDirs, false);
			}
		}
	}

	private newDir(textItem: TextItem, top: boolean) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'dirname', prompt: 'Enter directory name' }).then(newdir => {
				if (newdir) {
					let dirPath = visualText.analyzer.getInputDirectory().fsPath;
					if (textItem && !top)
						dirPath = dirfuncs.getDirPath(textItem.uri.fsPath);
					dirPath = path.join(dirPath, newdir);
					dirfuncs.makeDir(dirPath);
					vscode.commands.executeCommand('textView.refreshAll');
				}
			});
		}
	}

	private newText(textItem: TextItem, top: boolean) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter text file name' }).then(newname => {
				if (newname) {
					let dirPath = visualText.analyzer.getInputDirectory().fsPath;
					if (textItem && !top)
						dirPath = dirfuncs.getDirPath(textItem.uri.fsPath);
					let filepath = path.join(dirPath, newname + '.txt');
					if (path.extname(newname))
						filepath = path.join(dirPath, newname);
					dirfuncs.writeFile(filepath, 'Hello world!');
					vscode.commands.executeCommand('textView.refreshAll');
				}
			});
		}
	}
}
