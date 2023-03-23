import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { visualText } from './visualText';
import { TextFile, nlpFileType } from './textFile';
import { SequenceFile, PassItem } from './sequence';
import { logView, logLineType } from './logView';

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
        var retVal = false;
        if (visualText.modFiles.length == 0) {
            let items: vscode.QuickPickItem[] = [];
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
            let items: vscode.QuickPickItem[] = visualText.modFileList();
            await vscode.window.showQuickPick(items, {title: 'Add to Mod File', canPickMany: false, placeHolder: 'choose mod file'}).then(selection => {
                if (!selection || !selection.description)
                    return false;
                let modUri = vscode.Uri.file(selection.description);
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
        var relFilePath = '';
        var filepath = '';
        var content = '';
        this.seqInsertPoint = '';
        var kb = false;
        var spec = false;
        var input = false;

        if (this.parseFiles(filePath)) {
            await this.selectInsertPoint(filePath);
            if (this.seqInsertPoint == 'abort')
                return;
            var textFile = new TextFile();

            for (let mod of this.files) {
                textFile.setFile(mod.uri);
                textFile.setText(mod.content);
                textFile.saveFile();
                if (mod.type == modType.INPUT) input = true;
                if (mod.type == modType.KB) kb = true;
                if (mod.type == modType.SPEC) spec = true;
        
                if (mod.type == modType.SPEC) {
                    var seqItem: PassItem = visualText.analyzer.seqFile.findPassFromUri(this.seqInsertPoint);
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
        var textFile = new TextFile();
        var uri = vscode.Uri.file(filepath);

        textFile.setFile(uri);
        textFile.setText(content);
        textFile.saveFile();

        if (filepath.includes('\\spec\\')) {
            var seqItem: PassItem = visualText.analyzer.seqFile.findPassFromUri(filepath);
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
        var good = true;
        var content = '';
        var started = false;
        var modItem: ModItem = {uri: vscode.Uri.file(''), parentDir: '', filename: '', type: modType.UNKNOWN, content: '', exists: false};
        this.files = [];

        for (let line of this.getLines()) {
            if (line.indexOf(this.MODFILE_HEADER) == 0) {
                started = true;
                if (content.length > 0) {
                    var mod = this.files[this.files.length - 1];
                    mod.content = content;
                }
                content = '';
                var tokens = line.split(/[\<\t\s\>]/);
                var relFilePath = tokens[2];
                var modItem = this.getModItem(relFilePath);
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
            var mod = this.files[this.files.length - 1];
            mod.content = content;
        }
        if (!good) {
            vscode.commands.executeCommand('logView.refreshAll');  
        }
        return good;
    }

    getModItem(relFilePath: string): ModItem {
        var filepath = path.join(visualText.analyzer.getAnalyzerDirectory().fsPath,relFilePath);
        var type: modType = modType.UNKNOWN;
        var filename = path.basename(filepath);
        var parentDir = path.dirname(relFilePath);
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
        var filepath = '';
        for (let line of this.getLines()) {
            if (line.indexOf(this.MODFILE_HEADER) == 0) {
                var tokens = line.split(/[\<\t\s\>]/);
                var relFilePath = tokens[2];
                filepath = path.join(visualText.getAnalyzerDir().fsPath,relFilePath);
                if (filepath.includes(this.MODFILE_SPEC)) {
                    let seq = new SequenceFile;
                    let items: vscode.QuickPickItem[] = [];
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
        var fileContent: string = fs.readFileSync(filePath.fsPath,'utf8');
        this.appendText(this.headerLine(filePath));
        this.appendText(fileContent);
        this.saveFile();
    }

    headerLine(filePath: vscode.Uri) {
        var header = '';
        var filepath = filePath.fsPath;
        var dir = '';
        var diff = path.win32.normalize(filepath);
        if (filepath.includes(this.MODFILE_KB)) {
            dir = path.join('kb','user');
        }
        else if (filepath.includes(this.MODFILE_SPEC)) {
            dir = 'spec';
        }
        else if (filepath.includes(this.MODFILE_INPUT)) {
            dir = 'input';
        }
        var name = path.basename(filePath.fsPath);
        var finalPath = path.join(dir,name);
        header = '\n' + this.MODFILE_HEADER + ' ' + finalPath + '>\n';
        return header;
    }
}