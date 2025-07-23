import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { TextFile, nlpFileType } from './textFile';
import { SequenceFile, PassItem } from './sequence';
import { logView, logLineType } from './logView';
import { anaSubDir } from './analyzer';

export enum modType { UNKNOWN, INPUT, SPEC, KB }

interface ModItem {
	uri: vscode.Uri;
    parentDir: string;
    filename: string;
	content: string;
	type: modType;
    exists: boolean;
}

export let modFile: ModFile;
export class ModFile extends TextFile {

    public readonly MODFILE_HEADER = '<modfile';
    public readonly MODFILE_KB = '\\kb\\user\\';
    public readonly MODFILE_SPEC = '\\spec\\';
    public readonly MODFILE_INPUT = '\\input\\';
    private seqInsertPoint: string | undefined = '';
    private files: ModItem[] = new Array();

	constructor() {
		super();
	}

    async getMod(): Promise<boolean> {
        let retVal = false;
        if (visualText.modFiles.length == 0) {
            const items: vscode.QuickPickItem[] = [];
			items.push({label: 'Create', description: 'Create a new mod file'});
			items.push({label: 'Abort', description: 'Abort this attempt' });

			await vscode.window.showQuickPick(items, {title: 'Mod File', canPickMany: false, placeHolder: 'Choose create or abort'}).then(selection => {
				if (typeof selection === undefined || !selection || selection.label == 'Abort')
                    retVal = false;
                else {
                    visualText.analyzer.modCreate(visualText.analyzer.getKBDirectory());
                    retVal = true;                    
                }
			});
        } else {
            const items: vscode.QuickPickItem[] = visualText.modFileList();
            await vscode.window.showQuickPick(items, {title: 'Add to Mod File', canPickMany: false, placeHolder: 'choose mod file'}).then(selection => {
                if (!selection || !selection.description)
                    return false;
                const modUri = vscode.Uri.file(selection.description);
                visualText.setModFile(modUri);
                retVal = true;
            });
        }
        return retVal;
    }

    addFile(uri: vscode.Uri, showFile: boolean=false) {
        visualText.mod.getMod().then(retVal => {
			if (retVal) {
                visualText.mod.appendFile(uri);
                if (showFile)
                    vscode.window.showTextDocument(this.getUri());                
            }
		});
    }

    async load(filePath: vscode.Uri) {
        this.setFile(filePath);
        const relFilePath = '';
        const filepath = '';
        const content = '';
        this.seqInsertPoint = '';
        let kb = false;
        let spec = false;
        let input = false;

        if (this.parseFiles(filePath)) {
            await this.selectInsertPoint(filePath);
            if (this.seqInsertPoint == 'abort')
                return;
            const textFile = new TextFile();

            for (const mod of this.files) {
                textFile.setFile(mod.uri);
                textFile.setText(mod.content);
                textFile.saveFile();
                if (mod.type == modType.INPUT) input = true;
                if (mod.type == modType.KB) kb = true;
                if (mod.type == modType.SPEC) spec = true;
        
                if (mod.type == modType.SPEC) {
                    const seqItem: PassItem = visualText.analyzer.seqFile.findPassFromUri(this.seqInsertPoint);
                    visualText.analyzer.seqFile.insertPass(seqItem.passNum,mod.uri);
                }
            }
            if (filepath.length > 0 && content.length > 0)
                this.saveSection(filepath,content);

            if (input) vscode.commands.executeCommand('textView.refreshAll');
            if (spec) vscode.commands.executeCommand('sequenceView.refreshAll');
            if (kb) vscode.commands.executeCommand('kbView.refreshAll');  
        }
    }

    saveSection(filepath: string, content: string) {
        const textFile = new TextFile();
        const uri = vscode.Uri.file(filepath);

        textFile.setFile(uri);
        textFile.setText(content);
        textFile.saveFile();

        if (filepath.includes('\\spec\\')) {
            const seqItem: PassItem = visualText.analyzer.seqFile.findPassFromUri(filepath);
            visualText.analyzer.seqFile.insertPass(seqItem.passNum,uri);
        }
    }

    clearMod(modItem: ModItem) {
        modItem.uri = vscode.Uri.file('');
        modItem.parentDir = '';
        modItem.filename = '';
        modItem.type = modType.UNKNOWN;
        modItem.content = '';
        modItem.exists = false;
    }

    parseFiles(filePath: vscode.Uri): boolean {
        this.setFile(filePath);
        let good = true;
        let content = '';
        let started = false;
        const modItem: ModItem = {uri: vscode.Uri.file(''), parentDir: '', filename: '', type: modType.UNKNOWN, content: '', exists: false};
        this.files = [];

        for (const line of this.getLines()) {
            if (line.indexOf(this.MODFILE_HEADER) == 0) {
                started = true;
                if (content.length > 0) {
                    const mod = this.files[this.files.length - 1];
                    mod.content = content;
                }
                content = '';
                const tokens = line.split(/[\<\t\s\>]/);
                const relFilePath = tokens[2];
                const modItem = this.getModItem(relFilePath);
                this.files.push(modItem);
                if (modItem.exists) {
                    logView.addMessage('Mod exists: ' + path.join(modItem.parentDir,modItem.filename), logLineType.WARNING, modItem.uri);
                    good = false;
                }
            } else if (started) {
                content = content + line + '\n';
            }
        }
        if (content.length > 0) {
            const mod = this.files[this.files.length - 1];
            mod.content = content;
        }
        if (!good) {
            vscode.commands.executeCommand('logView.refreshAll');  
        }
        return good;
    }

    getModItem(relFilePath: string): ModItem {
        const filepath = path.join(visualText.analyzer.getAnalyzerDirectory().fsPath,relFilePath);
        let type: modType = modType.UNKNOWN;
        const filename = path.basename(filepath);
        const parentDir = path.dirname(relFilePath);
        if (filepath.includes(this.MODFILE_KB)) {
            type = modType.KB;
        }
        else if (filepath.includes(this.MODFILE_SPEC)) {
            type = modType.SPEC;
        }
        else if (filepath.includes(this.MODFILE_INPUT)) {
            type = modType.INPUT;
        }
        return {uri: vscode.Uri.file(filepath), parentDir: parentDir, filename: filename, type: type, content: '', exists: fs.existsSync(filepath)};
    }

    async selectInsertPoint(filePath: vscode.Uri): Promise<string> {
        this.setFile(filePath);
        let filepath = '';
        for (const line of this.getLines()) {
            if (line.indexOf(this.MODFILE_HEADER) == 0) {
                const tokens = line.split(/[\<\t\s\>]/);
                const relFilePath = tokens[2];
                filepath = path.join(visualText.getAnalyzerDir().fsPath,relFilePath);
                if (filepath.includes(this.MODFILE_SPEC)) {
                    const seq = new SequenceFile;
                    const items: vscode.QuickPickItem[] = [];
                    seq.choicePasses(visualText.analyzer.getSpecDirectory().fsPath,items,'');
                    await vscode.window.showQuickPick(items, {title: 'Choose Pass', canPickMany: false, placeHolder: 'Choose pass to insert after'}).then(selection => {
                        if (typeof selection === undefined || !selection) {
                            this.seqInsertPoint = 'abort';
                        } else {
                            this.seqInsertPoint = selection.description;
                        }
                    });
                }
            }
        }
        return '';
    }

    appendFile(filePath: vscode.Uri) {
        const fileContent: string = fs.readFileSync(filePath.fsPath,'utf8');
        this.appendText(this.headerLine(filePath));
        this.appendText(fileContent);
        this.saveFile();
    }

    headerLine(filePath: vscode.Uri) {
        let header = '';
        const filepath = filePath.fsPath;
        let dir = '';
        const diff = path.win32.normalize(filepath);
        if (filepath.includes(this.MODFILE_KB)) {
            dir = visualText.analyzer.anaSubDirPath(anaSubDir.KB);
        }
        else if (filepath.includes(this.MODFILE_SPEC)) {
            dir = visualText.analyzer.anaSubDirPath(anaSubDir.SPEC);
        }
        else if (filepath.includes(this.MODFILE_INPUT)) {
            dir = visualText.analyzer.anaSubDirPath(anaSubDir.INPUT);
        }
        const name = path.basename(filePath.fsPath);
        const finalPath = path.join(dir,name);
        header = '\n' + this.MODFILE_HEADER + ' ' + finalPath + '>\n';
        return header;
    }
}
