import * as vscode from 'vscode';
import * as path from 'path';
import { visualText } from './visualText';
import { FindFile } from './findFile';
import { findView } from './findView';
import { outputView } from './outputView';
import { dirfuncs, getFileTypes } from './dirfuncs';
import { TextFile } from './textFile';
import { fileOperation, fileOpRefresh } from './fileOps';
import * as fs from 'fs';

export interface KBItem {
	uri: vscode.Uri;
	type: vscode.FileType;
}

export class FileSystemProvider implements vscode.TreeDataProvider<KBItem> {

	private _onDidChangeTreeData: vscode.EventEmitter<KBItem | undefined | null | void> = new vscode.EventEmitter<KBItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<KBItem | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	constructor() {}

	async getChildren(kbItem?: KBItem): Promise<KBItem[]> {
		if (kbItem) {
			return this.getKBFiles(kbItem.uri); 
		}
		if (visualText.hasWorkspaceFolder() && visualText.hasAnalyzers() && visualText.analyzer.isLoaded()) {
			return this.getKBFiles(visualText.analyzer.getKBDirectory());  
        }
		return [];
	}

	getTreeItem(kbItem: KBItem): vscode.TreeItem {
		const treeItem = new vscode.TreeItem(kbItem.uri, kbItem.type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

        let name = path.basename(kbItem.uri.fsPath);
        treeItem.command = { command: 'kbView.openFile', title: "Open File", arguments: [kbItem], };
        treeItem.contextValue = 'kb';

		var icon = visualText.fileIconFromExt(kbItem.uri.fsPath);

		treeItem.iconPath = {
			light: path.join(__filename, '..', '..', 'resources', 'light', icon),
			dark: path.join(__filename, '..', '..', 'resources', 'dark', icon)
		}

		if (name.endsWith('.kbb') || name.endsWith('.dict') || name.endsWith('.kbbb') || name.endsWith('.dictt'))
			treeItem.contextValue = 'toggle';

		if (name.endsWith('.kb'))
			treeItem.contextValue = 'old';
		else if (!name.endsWith('.nlm'))
			treeItem.contextValue = treeItem.contextValue + 'nomo';
		else
			treeItem.contextValue = treeItem.contextValue + 'mod';

		return treeItem;
	}

	getKBFiles(dir: vscode.Uri): KBItem[] {
		var files = Array();
		var entries = dirfuncs.getDirectoryTypes(dir);
		visualText.mod.clear();
		visualText.modFiles = [];
		const order = ['.dict', '.dictt', '.kbb', '.kbbb', '.nlm', '.kb', '.test', '.txt'];

		for (let ext of order) {
			for (let entry of entries) {
				if (entry.type != vscode.FileType.Directory && entry.uri.fsPath.endsWith(ext)) {
					files.push({uri: entry.uri, type: entry.type});
					if (entry.uri.fsPath.endsWith('.nlm'))
						visualText.modFiles.push(entry.uri);
				}
			}
		}

		return files;
	}

	dirHasNonText(dir: vscode.Uri): boolean {
		const files = dirfuncs.getFiles(dir);
		for (let file of files) {
			if (!file.fsPath.endsWith('.txt'))
				return true;
		}
		return false;
	}

	existingFile(kbItem: KBItem) {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: true,
				openLabel: 'Add Existing File(s)',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: true,
				canSelectFolders: false,
				filters: {
					'Text files': ['txt','xml','html','csv'],
					'All files': ['*']
				}
			};
			
			vscode.window.showOpenDialog(options).then(selections => {
				if (!selections) {
					return;
				}
				for (let sel of selections) {
					var filename = path.basename(sel.fsPath);
					var dir = visualText.analyzer.getInputDirectory().fsPath;
					if (kbItem) {
						dir = path.dirname(kbItem.uri.fsPath);
					} else if (visualText.analyzer.getTextPath()) {
						var textPath = visualText.analyzer.getTextPath().fsPath;
						if (fs.existsSync(textPath))
							dir = path.dirname(textPath);
						else
							dir = visualText.analyzer.getInputDirectory().fsPath;
					}
					var newPath = vscode.Uri.file(path.join(dir,filename));
					visualText.fileOps.addFileOperation(sel,newPath,[fileOpRefresh.KB],fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();
			});	
		}
	}

	existingFolder(kbItem: KBItem) {
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
				for (let sel of selections) {
					var dirname = path.basename(sel.fsPath);
					var dir = visualText.analyzer.getInputDirectory().fsPath;
					if (kbItem) {
						dir = path.dirname(kbItem.uri.fsPath);
					}
					var newPath = vscode.Uri.file(path.join(dir,dirname));
					visualText.fileOps.addFileOperation(sel,newPath,[fileOpRefresh.KB],fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();	
			});	
		}
	}
	
	rename(kbItem: KBItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(kbItem.uri.fsPath), prompt: 'Enter new name for file' }).then(newname => {
				if (newname) {
					var original = kbItem.uri;
					if (path.extname(newname).length == 0)
						newname = newname+path.extname(kbItem.uri.fsPath);
					var newfile = vscode.Uri.file(path.join(path.dirname(kbItem.uri.fsPath),newname));
					dirfuncs.rename(original.fsPath,newfile.fsPath);	
					var logFolderOrig = vscode.Uri.file(path.join(original.fsPath + visualText.LOG_SUFFIX));
					if (dirfuncs.isDir(logFolderOrig.fsPath)) {
						var logFolderNew = vscode.Uri.file(path.join(path.dirname(kbItem.uri.fsPath),newname + visualText.LOG_SUFFIX));
						dirfuncs.rename(logFolderOrig.fsPath,logFolderNew.fsPath);
					}
					vscode.commands.executeCommand('kbView.refreshAll');	
				}
			});
		}
	}
		
	renameDir(kbItem: KBItem): void {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: path.basename(kbItem.uri.fsPath), prompt: 'Enter new name for directory' }).then(newname => {
				if (newname) {
					var original = kbItem.uri;
					var newfile = vscode.Uri.file(path.join(path.dirname(kbItem.uri.fsPath),newname));
					dirfuncs.rename(original.fsPath,newfile.fsPath);						
					vscode.commands.executeCommand('kbView.refreshAll');	
				}
			});
		}
	}
}

export let kbView: KBView;
export class KBView {

	private kbView: vscode.TreeView<KBItem>;
	private findFile = new FindFile();
	private textFile = new TextFile();

	constructor(context: vscode.ExtensionContext) {
		const treeDataProvider = new FileSystemProvider();
		this.kbView = vscode.window.createTreeView('kbView', { treeDataProvider });
		vscode.commands.registerCommand('kbView.refreshAll', () => treeDataProvider.refresh());
		vscode.commands.registerCommand('kbView.existingFile', (KBItem) => treeDataProvider.existingFile(KBItem));
		vscode.commands.registerCommand('kbView.existingFolder', (KBItem) => treeDataProvider.existingFolder(KBItem));
		vscode.commands.registerCommand('kbView.rename', (KBItem) => treeDataProvider.rename(KBItem));
		vscode.commands.registerCommand('kbView.renameDir', (KBItem) => treeDataProvider.renameDir(KBItem));

		vscode.commands.registerCommand('kbView.openFile', (KBItem) => this.openKBFile(KBItem));
		vscode.commands.registerCommand('kbView.openText', () => this.openText());
		vscode.commands.registerCommand('kbView.search', () => this.search());
		vscode.commands.registerCommand('kbView.newKBFile', (KBItem) => this.newKBFile(KBItem,false));
		vscode.commands.registerCommand('kbView.newKBBFile', (KBItem) => this.newKBBFile(KBItem,false));
		vscode.commands.registerCommand('kbView.newDictFile', (KBItem) => this.newDictFile(KBItem,false));
		vscode.commands.registerCommand('kbView.deleteFile', (KBItem) => this.deleteFile(KBItem));
		vscode.commands.registerCommand('kbView.deleteDir', (KBItem) => this.deleteFile(KBItem));;
		vscode.commands.registerCommand('kbView.updateTitle', (KBItem) => this.updateTitle(KBItem));
		vscode.commands.registerCommand('kbView.generateMain', () => this.generateMain());
		vscode.commands.registerCommand('kbView.mergeDicts', () => this.mergeDicts());
		vscode.commands.registerCommand('kbView.explore', () => this.explore());
		vscode.commands.registerCommand('kbView.existingFiles', () => this.existingFiles());
		vscode.commands.registerCommand('kbView.toggleActive', (KBItem) => this.toggleActive(KBItem));
		vscode.commands.registerCommand('kbView.copyToAnalyzer', (KBItem) => this.copyToAnalyzer(KBItem));
		vscode.commands.registerCommand('kbView.cleanFiles', () => this.cleanFiles());
		vscode.commands.registerCommand('kbView.video', () => this.video());
		vscode.commands.registerCommand('kbView.modAdd', (KBItem) => this.modAdd(KBItem));
		vscode.commands.registerCommand('kbView.modCreate', () => this.modCreate());
		vscode.commands.registerCommand('kbView.modLoad', (KBItem) => this.modLoad(KBItem));
		vscode.commands.registerCommand('kbView.langLibs', (KBItem) => this.langLibs());
		vscode.commands.registerCommand('kbView.miscLibs', () => this.miscLibs());
    }
    
    static attach(ctx: vscode.ExtensionContext) {
        if (!kbView) {
            kbView = new KBView(ctx);
        }
        return kbView;
	}
	
	langLibs() {
		var fileDir = path.join(visualText.getVisualTextDirectory(),"languages");
		let items: vscode.QuickPickItem[] = [];

		var exts: string[] = [];
		exts.push(".dict");
		exts.push(".kbb");
		var dictFiles = dirfuncs.getFiles(vscode.Uri.file(fileDir), exts, getFileTypes.DIRS);
		for (let dictFile of dictFiles) {
			let descr = "";

			let language = path.basename(dictFile.fsPath);
			items.push({label: language, description: `${language} language dictionaries, knowledge bases, mod files`});
		}

		if (items.length == 0) {
			vscode.window.showWarningMessage('Not created yet and you can help!');
			return;
		}

		vscode.window.showQuickPick(items, {title: 'Choose Language', canPickMany: false, placeHolder: 'Choose Language to see dictionaries and KB'}).then(selection => {
			if (!selection)
				return;
			if (selection.label) {
				this.chooseLibFiles('Dictionary','languages',selection.label,[".dict",".kbb",".nlm"]);
			}	
		});
	}

	miscLibs() {
		this.chooseLibFiles('Choose File','misc','',[".dict",".kbb",".nlm"]);
	}

	modLoad(kbItem: KBItem) {
		visualText.mod.load(kbItem.uri);
	}

	modCreate() {
		var uri = visualText.analyzer.getKBDirectory();
		visualText.analyzer.modCreate(uri);
	}

	modAdd(kbItem: KBItem): void {
		visualText.mod.addFile(kbItem.uri,true);
	}

	video() {
		var url = 'http://vscodekbviewer.visualtext.org';
		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
	}

	cleanFiles() {
		var fileDir = visualText.analyzer.getKBDirectory().fsPath;
		let items: vscode.QuickPickItem[] = [];
		let files: vscode.Uri[] = [];
		let allStr = 'ALL FILES BELOW';
		let allButValidStr = 'ALL BUT VALID KB FILES';

		var dictFiles = dirfuncs.getFiles(vscode.Uri.file(fileDir),[],getFileTypes.FILES);
		if (dictFiles.length == 0) {
			vscode.window.showWarningMessage('No KB files to delete');
			return;
		}
		items.push({label: allStr, description: 'All the files listed below (non .KB files)'});
		items.push({label: allButValidStr, description: 'All files except .KB, .KBB, and .DICT files'});

		var dictFiles = dirfuncs.getFiles(vscode.Uri.file(fileDir),[],getFileTypes.FILES);
		for (let dictFile of dictFiles) {
			if (path.extname(dictFile.fsPath) == '.kb')
				continue;
			items.push({label: path.basename(dictFile.fsPath), description: dictFile.fsPath});
			files.push(dictFile);
		}

		if (items.length <= 1) {
			vscode.window.showWarningMessage('No files to clean');
			return;
		}

		vscode.window.showQuickPick(items, {title: 'Clean Dictionary', canPickMany: true, placeHolder: 'Choose files to delete'}).then(selections => {
			if (!selections)
				return;
			let found = false;
			if (selections[0].label == allStr) {
				for (let file of files) {
					found = true;
					visualText.fileOps.addFileOperation(file,file,[fileOpRefresh.KB],fileOperation.DELETE);
				}
			} else if (selections[0].label == allButValidStr) {
				for (let file of files) {
					let ext = path.extname(file.fsPath);
					if (ext != '.kb' && ext != '.kbb' && ext != '.dict') {
						found = true;
						visualText.fileOps.addFileOperation(file,file,[fileOpRefresh.KB],fileOperation.DELETE);
					}
				}
			} else {
				for (let selection of selections) {
					if (selection.description) {
						let uri = vscode.Uri.file(selection.description);
						found = true;
						visualText.fileOps.addFileOperation(uri,uri,[fileOpRefresh.KB],fileOperation.DELETE);							
					}
				}
			}
			if (!found) {
				vscode.window.showWarningMessage('No files to clean');
			} else {
				visualText.fileOps.startFileOps();
			}
		});
	}

	private chooseLibFiles(prompt: string, dirName: string, subDir: string, exts: string[]) {
		var fileDir = path.join(visualText.getVisualTextDirectory(),dirName,subDir);
		let items: vscode.QuickPickItem[] = [];

		var dictFiles = dirfuncs.getFiles(vscode.Uri.file(fileDir),exts);
		for (let dictFile of dictFiles) {
			let descr = "";

			let firstLine = this.textFile.readFirstLine(dictFile.fsPath);
			if (firstLine[0] == '#') {
				descr = firstLine.substring(1);
			}
			let icon = visualText.fileIconFromExt(dictFile.fsPath);
			let label = path.basename(dictFile.fsPath);
			let light = vscode.Uri.file(path.join(visualText.getExtensionPath().fsPath,"resources","light",icon));
			let dark = vscode.Uri.file(path.join(visualText.getExtensionPath().fsPath,"resources","dark",icon));
			items.push({label: label, description: descr, iconPath: {light: light, dark: dark}});
		}

		if (items.length == 0) {
			vscode.window.showWarningMessage('Not created yet and you can help!');
			return;
		}

		vscode.window.showQuickPick(items, {title: 'Choose ' + prompt, canPickMany: true, placeHolder: 'Choose ' + prompt + ' to insert'}).then(selections => {
			if (!selections)
				return;

			for (let selection of selections) {
				if (exts[0] == '.nlm') {
					var filepath = path.join(visualText.getVisualTextDirectory(),dirName,subDir,selection.label);
					visualText.mod.load(vscode.Uri.file(filepath));
				} else
					this.insertLibraryFile(path.join(dirName,subDir),selection.label);
			}
		});
	}

	insertLibraryFile(dir: string, filename: string) {
		var filepath = path.join(visualText.getVisualTextDirectory(),dir,filename);
		var newfile = path.join(visualText.analyzer.getKBDirectory().fsPath,filename);
		if (!fs.existsSync(filepath)) {
			vscode.window.showWarningMessage("Not created yet and YOU can help: " + filename);
		} else {
			visualText.fileOps.addFileOperation(vscode.Uri.file(filepath),vscode.Uri.file(newfile),[fileOpRefresh.KB],fileOperation.COPY);
			visualText.fileOps.startFileOps();
		}
	}

	copyToAnalyzer(KBItem: KBItem) {
		outputView.copyFileToAnalyzer(KBItem.uri,path.join('kb','user'),'Copy file to another analyzer','Copy file to the KB directory of:');
	}

	private toggleActive(KBItem: KBItem): void {
		var filepath = KBItem.uri.fsPath;
		if (KBItem && filepath.length) {
			var filename = path.basename(filepath);
			var parsed = path.parse(filename);
			let ext = '.kbb';
			if (filename.endsWith('.kbb')) {
				ext = '.kbbb';
			}
			else if (filename.endsWith('.kbbb')) {
				ext = '.kbb';
			}
			else if (filename.endsWith('.dict')) {
				ext = '.dictt';
			}
			else if (filename.endsWith('.dictt')) {
				ext = '.dict';
			}
			var newFilename = path.join(path.dirname(filepath),parsed.name + ext);
			visualText.fileOps.addFileOperation(KBItem.uri,vscode.Uri.file(newFilename),[fileOpRefresh.KB],fileOperation.RENAME);
			visualText.fileOps.startFileOps();
		}
		this.kbView.title = 'KB';
	}

	existingFiles() {
		if (visualText.hasWorkspaceFolder()) {
			const options: vscode.OpenDialogOptions = {
				canSelectMany: true,
				openLabel: 'Import Existing File(s)',
				defaultUri: visualText.getWorkspaceFolder(),
				canSelectFiles: true,
				canSelectFolders: false,
				filters: {
					'KB files': ['dict','kb','kbb','nlm'],
					'All files': ['*']
				}
			};
			
			vscode.window.showOpenDialog(options).then(selections => {
				if (!selections) {
					return;
				}
				var kbdir = visualText.analyzer.getKBDirectory().fsPath;
				for (let sel of selections) {
					var filename = path.basename(sel.fsPath);
					var newPath = vscode.Uri.file(path.join(kbdir,filename));
					visualText.fileOps.addFileOperation(sel,newPath,[fileOpRefresh.KB],fileOperation.COPY);
				}
				visualText.fileOps.startFileOps();
			});	
		}		
	}

	explore() {
		let kbDir = visualText.analyzer.getKBDirectory().fsPath;
		if (dirfuncs.isDir(kbDir))
			visualText.openFileManager(kbDir);
	}

	search() {
		if (visualText.hasWorkspaceFolder()) {
			if (visualText.hasWorkspaceFolder()) {
				vscode.window.showInputBox({ value: 'searchword', prompt: 'Enter term to search' }).then(searchWord => {
					if (searchWord) {
						this.findFile.searchFiles(visualText.analyzer.getKBDirectory(),searchWord,['.kb','.kbb','.dict','.nlm']);
						findView.loadFinds(searchWord,this.findFile.getMatches());
						findView.setSearchWord(searchWord);
						vscode.commands.executeCommand('findView.updateTitle');
						vscode.commands.executeCommand('findView.refreshAll');
					}
				});
			}
		}
	}

	private openText() {
		if (visualText.analyzer.hasText())
			visualText.colorizeAnalyzer();
			vscode.window.showTextDocument(visualText.analyzer.getTextPath());
			vscode.commands.executeCommand('status.update');
	}
	
	private updateTitle(resource: vscode.Uri): void {
		var filepath = resource.fsPath;
		if (resource && filepath.length) {
			var filename = path.basename(resource.fsPath);
			if (filename.length) {
				this.kbView.title = `KB (${filename})`;	
				return;					
			}
		}
		this.kbView.title = 'KB';
	}
	
	private mergeDicts(): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			items.push({label: 'Yes', description: 'Merge all the dictionary files into all.dict?'});
			items.push({label: 'No', description: 'Do not merge dictionary files' });

			vscode.window.showQuickPick(items, {title: 'Dict Files Merge', canPickMany: false, placeHolder: 'Choose Yes or No'}).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				var kbDir = visualText.analyzer.getKBDirectory();
				var appFile = vscode.Uri.file(path.join(visualText.analyzer.getKBDirectory().fsPath,"all.dict"));
				visualText.fileOps.addFileOperation(kbDir,appFile,[fileOpRefresh.KB],fileOperation.APPEND,".dict","");
				visualText.fileOps.startFileOps();
			});
		}
	}

	private generateMain(): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			deleteDescr = deleteDescr.concat('Generate main.kb file');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not generate main.kb' });

			vscode.window.showQuickPick(items, {title: 'Generate main.kb', canPickMany: false, placeHolder: 'Choose Yes or No'}).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				var kbPath = visualText.analyzer.getKBDirectory();
				var filePath = path.join(kbPath.fsPath,'main.kb');
				var files = dirfuncs.getFiles(kbPath);
				var attrs = '';
				var words = '';

				for (let file of files) {
					let filename = path.basename(file.fsPath);
					if (filename.startsWith('attr')) {
						attrs += "take \"kb/user/" +  filename + "\"\n";
					}
					else if (filename.startsWith('word')) {
						words += "take \"kb/user/" +  filename + "\"\n";
					}
				}
				let content = '';
				content += "take \"kb/user/hier.kb\"\nbind sys\n";
				content += words;
				content += "take \"kb/user/phr.kb\"\n";
				content += attrs;
				content += "quit\n";

				dirfuncs.writeFile(filePath,content);
				visualText.debugMessage('main.kb generated');
			});
		}
	}

	private openKBFile(kbItem: KBItem): void {
		if (kbItem.uri.fsPath.endsWith('.nlm'))
			visualText.setModFile(kbItem.uri);
		this.openFile(kbItem.uri);
	}

	private openFile(uri: vscode.Uri): void {
		this.updateTitle(uri);
		visualText.colorizeAnalyzer();
		vscode.window.showTextDocument(uri);
		visualText.analyzer.saveCurrentFile(uri);
		vscode.commands.executeCommand('status.update');
	}

	private deleteFile(kbItem: KBItem): void {
		if (visualText.hasWorkspaceFolder()) {
			let items: vscode.QuickPickItem[] = [];
			var deleteDescr = '';
			var filename = path.basename(kbItem.uri.fsPath);
			deleteDescr = deleteDescr.concat('Delete \'',filename,'\'?');
			items.push({label: 'Yes', description: deleteDescr});
			items.push({label: 'No', description: 'Do not delete '+filename });

			vscode.window.showQuickPick(items, {title: 'Delete File', canPickMany: false, placeHolder: 'Choose Yes or No'}).then(selection => {
				if (!selection || selection.label == 'No')
					return;
				visualText.fileOps.addFileOperation(kbItem.uri,kbItem.uri,[fileOpRefresh.KB],fileOperation.DELETE);
				visualText.fileOps.startFileOps();
			});
		}
	}
	
	private newKBBFile(kbItem: KBItem, top: boolean) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter KBB file name' }).then(newname => {
				if (newname) {
					var dirPath = visualText.analyzer.getKBDirectory().fsPath;
					if (kbItem && !top)
						dirPath = dirfuncs.getDirPath(kbItem.uri.fsPath);
					var filepath = path.join(dirPath,newname+'.kbb');
					if (path.extname(newname))
						filepath = path.join(dirPath,newname);
					dirfuncs.writeFile(filepath,"topconcept\n  child: attr=[value,value2]\n    grandchild one\n    grandchild two\n");
					this.openFile(vscode.Uri.file(filepath));
					vscode.commands.executeCommand('kbView.refreshAll');
				}
			});
		}
	}

	private newKBFile(kbItem: KBItem, top: boolean) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter KB file name' }).then(newname => {
				if (newname) {
					var dirPath = visualText.analyzer.getKBDirectory().fsPath;
					if (kbItem && !top)
						dirPath = dirfuncs.getDirPath(kbItem.uri.fsPath);
					var filepath = path.join(dirPath,newname+'.kb');
					if (path.extname(newname))
						filepath = path.join(dirPath,newname);
					dirfuncs.writeFile(filepath,"\n\nquit\n\n");
					this.openFile(vscode.Uri.file(filepath));
					vscode.commands.executeCommand('kbView.refreshAll');
				}
			});
		}
	}

	private newDictFile(kbItem: KBItem, top: boolean) {
		if (visualText.hasWorkspaceFolder()) {
			vscode.window.showInputBox({ value: 'filename', prompt: 'Enter Dictionary file name' }).then(newname => {
				if (newname) {
					var dirPath = visualText.analyzer.getKBDirectory().fsPath;
					if (kbItem && !top)
						dirPath = dirfuncs.getDirPath(kbItem.uri.fsPath);
					var filepath = path.join(dirPath,newname+'.dict');
					if (path.extname(newname))
						filepath = path.join(dirPath,newname);
					dirfuncs.writeFile(filepath,"word s=suggestedNode attr=value");
					this.openFile(vscode.Uri.file(filepath));
					vscode.commands.executeCommand('kbView.refreshAll');
				}
			});
		}
	}
}