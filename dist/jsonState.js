"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonState = exports.jsonState = void 0;
const tslib_1 = require("tslib");
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const visualText_1 = require("./visualText");
class JsonState {
    constructor() {
        this.json = undefined;
        this.jsonStr = '';
        this.dirPath = '';
        this.filePath = '';
        this.tabSize = 4;
        this.exists = false;
    }
    setFilePath(dirPath, filename) {
        this.exists = false;
        this.dirPath = path.join(dirPath, '.vscode');
        this.filePath = path.join(this.dirPath, filename + '.json');
        if (fs.existsSync(this.filePath)) {
            this.exists = true;
        }
        return this.exists;
    }
    fileExists() {
        return this.exists;
    }
    getFilePath() {
        return this.filePath;
    }
    jsonParse(dirPath, filename) {
        if (this.setFilePath(dirPath.fsPath, filename)) {
            this.jsonStr = fs.readFileSync(this.filePath, 'utf8');
            if (this.jsonStr.length) {
                try {
                    this.json = JSON.parse(this.jsonStr);
                    return true;
                }
                catch (e) {
                    visualText_1.visualText.debugMessage('Jason file error: ' + this.filePath + ' -- ' + e);
                    return false;
                }
            }
        }
        return false;
    }
    saveFile(dirPath, filename, json) {
        this.json = json;
        this.setFilePath(dirPath, filename);
        this.writeFile();
        return true;
    }
    writeFile() {
        const jsonStr = JSON.stringify(this.json, null, this.tabSize);
        if (!fs.existsSync(this.dirPath)) {
            try {
                fs.mkdirSync(this.dirPath);
            }
            catch (err) {
                console.log('Error creating .vscode folder: ' + err.message);
            }
        }
        try {
            fs.writeFileSync(this.filePath, jsonStr, { flag: 'w' });
        }
        catch (err) {
            console.log('Error writing file ' + this.filePath + ': ' + err.message);
        }
    }
}
exports.JsonState = JsonState;
//# sourceMappingURL=jsonState.js.map