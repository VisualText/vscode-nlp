import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export let jsonState: JsonState;
export class JsonState {

    public json: any = undefined;
    private jsonStr: string = '';
    private dirPath: string = '';
    private filePath: string = '';
    private tabSize: number = 4;
    private exists: boolean = false;

    constructor() {
    }

    setFilePath(dirPath: string, filename: string): boolean {
        this.exists = false;
        this.dirPath = path.join(dirPath,'.vscode');
        this.filePath = path.join(this.dirPath,filename+'.json');
        if (fs.existsSync(this.filePath)) {
            this.exists = true;
        }
        return this.exists;
    }

    fileExists(): boolean {
        return this.exists;
    }

    getFilePath(): string {
        return this.filePath;
    }

    jsonParse(dirPath: vscode.Uri, filename: string, label: string): boolean {
        if (this.setFilePath(dirPath.fsPath,filename)) {
            this.jsonStr = fs.readFileSync(this.filePath, 'utf8');
            if (this.jsonStr.length) {
                this.json = JSON.parse(this.jsonStr);
                return true;
            }            
        }
        return false;
    }

    saveFile(dirPath: string, filename: string, json: any): boolean {
        this.json = json;
        this.setFilePath(dirPath,filename);
        this.writeFile();
        return true;
    }

    writeFile() {
        var jsonStr = JSON.stringify(this.json,null,this.tabSize);
        if (!fs.existsSync(this.dirPath)) {
            try {
                fs.mkdirSync(this.dirPath);
            } catch (err) {
                console.log('Error creating .vscode folder: ' + err.message)
            }            
        }

        try {
            fs.writeFileSync(this.filePath,jsonStr,{flag:'w'});
        } catch (err) {
            console.log('Error writing file ' + this.filePath + ': ' + err.message)
        }
    }
}