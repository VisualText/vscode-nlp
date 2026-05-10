"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceFile = exports.PassItem = exports.newPassType = exports.moveDirection = void 0;
const tslib_1 = require("tslib");
const vscode = tslib_1.__importStar(require("vscode"));
const path = tslib_1.__importStar(require("path"));
const fs = tslib_1.__importStar(require("fs"));
const textFile_1 = require("./textFile");
const visualText_1 = require("./visualText");
const dirfuncs_1 = require("./dirfuncs");
const treeFile_1 = require("./treeFile");
const nlp_1 = require("./nlp");
var moveDirection;
(function (moveDirection) {
    moveDirection[moveDirection["UP"] = 0] = "UP";
    moveDirection[moveDirection["DOWN"] = 1] = "DOWN";
})(moveDirection || (exports.moveDirection = moveDirection = {}));
var newPassType;
(function (newPassType) {
    newPassType[newPassType["RULES"] = 0] = "RULES";
    newPassType[newPassType["CODE"] = 1] = "CODE";
    newPassType[newPassType["DECL"] = 2] = "DECL";
})(newPassType || (exports.newPassType = newPassType = {}));
class PassItem {
    constructor() {
        this.uri = vscode.Uri.file('');
        this.library = vscode.Uri.file('');
        this.text = '';
        this.name = '';
        this.comment = '';
        this.passNum = 0;
        this.row = 0;
        this.tokenizer = false;
        this.typeStr = '';
        this.inFolder = false;
        this.empty = true;
        this.active = true;
        this.tokenizers = ['tokenize', 'tok', 'token', 'cmltokenize', 'cmltok', 'dicttok', 'dicttokz', 'chartok'];
        this.tokenizerTooltips = ['separate alphanumerics, numerics, and special', 'separate alphanumerics, numerics, and special', 'separate alphanumerics, numerics, and special', 'cml tokenizer (rarely used)', 'cml tokenizer (rarely used)', 'dictionary lookup', 'dictionary lookup no whitespace', 'separate all into characters'];
    }
    isTokenizer() {
        return this.tokenizers.includes(this.typeStr.toLowerCase());
    }
    fetchTooltip() {
        const index = this.tokenizers.indexOf(this.typeStr);
        const tooltip = this.tokenizerTooltips[index];
        return tooltip;
    }
    isRuleFile() {
        return this.typeStr.localeCompare('nlp') == 0 || this.typeStr.localeCompare('rec') == 0;
    }
    isFolder() {
        return this.typeStr.localeCompare('folder') == 0;
    }
    isStub() {
        return this.typeStr.localeCompare('stub') == 0;
    }
    isEnd(name) {
        return this.typeStr.localeCompare('end') == 0 && this.name.localeCompare(name) == 0;
    }
    fileExists() {
        return fs.existsSync(this.uri.fsPath) ? true : false;
    }
    exists() {
        return this.empty ? false : true;
    }
    isEmpty() {
        return this.empty;
    }
    clear() {
        this.uri = vscode.Uri.file('');
        this.text = '';
        this.name = '';
        this.comment = '';
        this.passNum = 0;
        this.row = 0;
        this.typeStr = '';
        this.inFolder = false;
        this.empty = true;
        this.active = true;
    }
}
exports.PassItem = PassItem;
class SequenceFile extends textFile_1.TextFile {
    constructor() {
        super();
        this.specDir = vscode.Uri.file('');
        this.passItems = new Array();
        this.cleanpasses = new Array();
        this.newcontent = '';
    }
    init() {
        if (visualText_1.visualText.analyzer.isLoaded()) {
            this.specDir = visualText_1.visualText.analyzer.getSpecDirectory();
            this.getPassFiles(this.specDir.fsPath);
        }
    }
    setSpecDir(specDir) {
        this.specDir = vscode.Uri.file(specDir);
    }
    libraryFileCheck() {
        for (const passItem of this.passItems) {
            passItem.library = vscode.Uri.file(this.getLibraryFile(passItem.uri.fsPath));
            if (passItem.library.fsPath.length > 2) {
                const moose = 1;
            }
        }
    }
    getPassFiles(specDir, addSpec = false) {
        specDir = addSpec ? path.join(specDir, visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER) : specDir;
        if (addSpec)
            this.setSpecDir(specDir);
        const anaFile = path.join(specDir, visualText_1.visualText.ANALYZER_SEQUENCE_FILE);
        super.setFile(vscode.Uri.file(anaFile), true);
        let passNum = 1;
        this.passItems = [];
        let folder = '';
        let row = 0;
        for (const passStr of this.getLines()) {
            const passItem = this.setPass(passStr, passNum);
            if (passItem.typeStr == 'folder' || passItem.typeStr == 'stub') {
                folder = passItem.name;
            }
            else if (folder.length) {
                if (passItem.typeStr == 'end' && passItem.name.localeCompare(folder) == 0) {
                    folder = '';
                }
                else {
                    passItem.inFolder = true;
                    passNum++;
                }
            }
            else if (passItem.exists())
                passNum++;
            if (passItem.text.length) {
                passItem.row = row++;
                passItem.uri = vscode.Uri.file(path.join(specDir, passItem.name + '.nlp'));
                passItem.library = vscode.Uri.file(this.getLibraryFile(passItem.uri.fsPath));
                this.passItems.push(passItem);
            }
        }
    }
    getPassItemFiles() {
        const files = new Array();
        for (const passItem of this.passItems) {
            files.push(passItem.uri);
        }
        return files;
    }
    getPassItems() {
        return this.passItems;
    }
    getLastItem() {
        return this.passItems[this.passItems.length - 1];
    }
    getLastItemInFolder(row) {
        const folderItem = this.passItems[row];
        for (let i = row; i < this.passItems.length; i++) {
            const passItem = this.passItems[i];
            if (passItem.name.localeCompare(folderItem.name) == 0 && passItem.typeStr.localeCompare('end') == 0)
                return passItem;
        }
        return folderItem;
    }
    isOrphan(nlpFileName) {
        for (const passItem of this.passItems) {
            if (passItem.name.localeCompare(nlpFileName) == 0)
                return false;
        }
        return true;
    }
    setPass(passStr, passNum) {
        const passItem = new PassItem();
        const tokens = passStr.split(/[\t\s]/);
        if (tokens.length >= 3) {
            passItem.text = passStr;
            passItem.passNum = passNum;
            if (tokens[0].localeCompare('#') == 0) {
                passItem.comment = this.tokenStr(tokens, 2);
                passItem.typeStr = '#';
            }
            else {
                const clean = tokens[0].replace('/', '');
                if (clean.length < tokens[0].length) {
                    passItem.active = false;
                    passItem.typeStr = clean;
                }
                else {
                    passItem.active = true;
                    passItem.typeStr = tokens[0];
                    if (passItem.isTokenizer()) {
                        passItem.tokenizer = true;
                    }
                }
                passItem.name = tokens[1];
                if (passItem.typeStr.localeCompare('pat') == 0) {
                    passItem.typeStr = 'nlp';
                }
                if (passItem.typeStr.localeCompare('nlp') == 0 || passItem.typeStr.localeCompare('rec') == 0) {
                    passItem.uri = this.passItemUri(passItem);
                }
                passItem.comment = this.tokenStr(tokens, 2);
            }
            passItem.empty = false;
        }
        return passItem;
    }
    passItemUri(passItem) {
        passItem.uri = vscode.Uri.file(path.join(this.specDir.fsPath, passItem.name + '.pat'));
        if (!fs.existsSync(passItem.uri.fsPath))
            passItem.uri = vscode.Uri.file(path.join(this.specDir.fsPath, passItem.name + '.nlp'));
        return passItem.uri;
    }
    tokenStr(tokens, start) {
        let tokenStr = '';
        let i = 0;
        const end = tokens.length;
        for (i = start; i < end; i++) {
            const tok = tokens[i];
            if (tokenStr.length)
                tokenStr = tokenStr + ' ';
            tokenStr = tokenStr + tok;
        }
        return tokenStr;
    }
    passString(passItem) {
        const activeStr = passItem.active ? '' : '/';
        return activeStr + passItem.typeStr + '\t' + passItem.name + '\t' + passItem.comment;
    }
    base(passname) {
        let basename = path.basename(passname, '.pat');
        basename = path.basename(basename, '.nlp');
        return basename;
    }
    getPassByRow(row) {
        for (const passItem of this.passItems) {
            if (passItem.row == row)
                return passItem;
        }
        return new PassItem();
    }
    getPassByNumber(passNumber) {
        for (const passItem of this.passItems) {
            if (passItem.passNum == passNumber)
                return passItem;
        }
        return new PassItem();
    }
    getUriByPassNumber(passNumber) {
        const passItem = this.getPassByNumber(passNumber);
        if (!passItem.isEmpty())
            return passItem.uri;
        return vscode.Uri.file('');
    }
    passCount() {
        return this.passItems.length;
    }
    atBottom(passItem) {
        const passes = this.getFolderPasses(passItem.typeStr, passItem.name, true);
        return passes.length + passItem.row == this.passCount();
    }
    cleanPasses() {
        this.cleanpasses = [];
        const passNum = 1;
        for (const passItem of this.passItems) {
            this.cleanpasses.push(this.passString(passItem));
        }
    }
    inFolder(passItem) {
        const passes = this.getPasses();
        let row = passes[passItem.row].row;
        while (row) {
            row--;
            const currentPass = passes[row];
            if (currentPass.typeStr == 'end') {
                return false;
            }
            else if (currentPass.typeStr == 'folder') {
                return true;
            }
        }
        return false;
    }
    renamePass(seqItem, newPassName) {
        if (this.passItems.length) {
            const passItem = this.findPass(seqItem.type, seqItem.name);
            if (seqItem.type.localeCompare('folder') == 0) {
                const passes = this.getFolderPasses(seqItem.type, seqItem.name, true);
                passes[passes.length - 1].name = newPassName;
            }
            passItem.name = newPassName;
            this.saveFile();
        }
    }
    duplicatePass(seqItem, newPassName) {
        if (this.passItems.length) {
            const passItem = this.findPass(seqItem.type, seqItem.name);
            const dupePath = path.join(path.dirname(passItem.uri.fsPath), newPassName + '.nlp');
            fs.copyFileSync(passItem.uri.fsPath, dupePath);
            const dupeItem = this.createPassItemFromFile(dupePath);
            this.passItems.splice(passItem.row + 1, 0, dupeItem);
            this.saveFile();
        }
    }
    insertPass(row, newpass) {
        if (this.passItems.length) {
            if (row >= 0) {
                let passes = new Array();
                passes.push(newpass);
                let copy = false;
                const specDir = visualText_1.visualText.analyzer.getSpecDirectory().fsPath;
                if (specDir.localeCompare(path.dirname(newpass.fsPath))) {
                    if (dirfuncs_1.dirfuncs.isDir(newpass.fsPath)) {
                        passes = [];
                        passes = dirfuncs_1.dirfuncs.getFiles(newpass);
                    }
                    copy = true;
                }
                let pi = this.passItems[0];
                for (const pass of passes) {
                    const passPath = path.join(specDir, path.basename(pass.fsPath));
                    if (copy) {
                        fs.copyFileSync(pass.fsPath, passPath);
                    }
                    pi = this.createPassItemFromFile(passPath);
                    row++;
                    this.passItems.splice(row, 0, pi);
                }
                this.saveFile();
                this.renumberPasses();
            }
        }
        return row;
    }
    findPassByFilename(filename) {
        const passes = this.getPasses();
        const name = path.parse(filename).name;
        for (const pass of passes) {
            if (pass.name == name) {
                return pass.passNum;
            }
        }
        return 0;
    }
    insertNewPass(seqItem, newPass, type) {
        if (this.passItems.length && newPass.length) {
            const foundItem = this.findPass(seqItem.type, seqItem.name);
            if (foundItem) {
                const newfile = this.createNewPassFile(newPass, type);
                const passItem = this.createPassItemFromFile(newfile);
                this.passItems.splice(foundItem.row + 1, 0, passItem);
                this.saveFile();
            }
        }
    }
    insertNewPassEnd(newpass, type) {
        if (this.passItems.length && newpass.length) {
            const newfile = this.createNewPassFile(newpass, type);
            const passItem = this.createPassItemFromFile(newfile);
            this.passItems.push(passItem);
            this.saveFile();
        }
    }
    insertNewFolderPass(row, folderName, type) {
        const passItem = this.getPassByRow(row);
        if (folderName.length) {
            if (passItem) {
                const newPassItem = this.createPassItemFolder(type, folderName);
                newPassItem.row = row + 1;
                newPassItem.passNum = passItem.passNum;
                this.passItems.splice(newPassItem.row, 0, newPassItem);
                this.saveFile();
                return newPassItem.row;
            }
        }
        return row;
    }
    insertNewFolder(seqItem, newFolder) {
        if (this.passItems.length && newFolder.length) {
            let foundItem = this.findPass(seqItem.type, seqItem.name);
            if (foundItem) {
                if (foundItem.isFolder()) {
                    foundItem = this.moveToFolderEnd(foundItem);
                }
                let passItem = this.createPassItemFolder('end', newFolder);
                this.passItems.splice(foundItem.row + 1, 0, passItem);
                passItem = this.createPassItemFolder('folder', newFolder);
                this.passItems.splice(foundItem.row + 1, 0, passItem);
                this.saveFile();
            }
        }
    }
    moveToFolderEnd(passItem) {
        const passes = this.getFolderPasses(passItem.typeStr, passItem.name, true);
        return passes[passes.length - 1];
    }
    insertNewFolderEnd(newFolder) {
        if (this.passItems.length && newFolder.length) {
            let passItem = this.createPassItemFolder('folder', newFolder);
            this.passItems.push(passItem);
            passItem = this.createPassItemFolder('end', newFolder);
            this.passItems.push(passItem);
            this.saveFile();
        }
    }
    createPassItemFolder(type, name) {
        const passItem = new PassItem();
        passItem.typeStr = type;
        passItem.name = name;
        passItem.comment = '# new folder';
        return passItem;
    }
    deletePass(seqItem) {
        const passItem = this.findPass(seqItem.type, seqItem.name);
        if (passItem.isFolder()) {
            this.deleteFolder(passItem);
        }
        else
            this.deletePassInSeqFile(passItem.typeStr, passItem.name);
        this.saveFile();
    }
    deleteFolder(passItem, foldersOnly = false) {
        const passes = this.getFolderPasses(passItem.typeStr, passItem.name, true);
        if (foldersOnly) {
            const len = passes.length;
            const first = passes[0];
            const last = passes[len - 1];
            this.deletePassInSeqFile(last.typeStr, last.name);
            this.deletePassInSeqFile(first.typeStr, first.name);
        }
        else {
            this.passItems.splice(passes[0].row, passes.length);
        }
    }
    deletePassInSeqFile(type, name) {
        const passItem = this.findPass(type, name);
        if (passItem) {
            this.passItems.splice(passItem.row, 1);
        }
    }
    createNewPassFile(filename, type) {
        const newfilepath = path.join(visualText_1.visualText.analyzer.getSpecDirectory().fsPath, filename.concat('.nlp'));
        fs.writeFileSync(newfilepath, this.newPassContent(filename, type), { flag: 'w+' });
        return newfilepath;
    }
    todayDate() {
        const today = new Date();
        const date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
        const time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
        return date + ' ' + time;
    }
    newPassContent(filename, type) {
        const config = vscode.workspace.getConfiguration('user');
        let username = config.get('name');
        if ((username === null || username === void 0 ? void 0 : username.length) == 0)
            username = 'Your Name';
        let newpass = '###############################################\n';
        newpass = newpass.concat('# FILE: ', filename, '\n');
        newpass = newpass.concat('# SUBJ: comment\n');
        newpass = newpass.concat(`# AUTH: ${username}\n`);
        newpass = newpass.concat('# CREATED: ', this.todayDate(), '\n');
        newpass = newpass.concat('# MODIFIED:\n');
        newpass = newpass.concat('###############################################\n\n');
        switch (type) {
            case newPassType.RULES:
                newpass = newpass.concat('@NODES _ROOT\n\n');
                newpass = newpass.concat('@RULES\n');
                newpass = newpass.concat('_xNIL <-\n');
                newpass = newpass.concat('	_xNIL	### (1)\n');
                newpass = newpass.concat('	@@\n');
                break;
            case newPassType.CODE:
                newpass = newpass.concat('@CODE\n\n');
                newpass = newpass.concat('G("kb") = getconcept(findroot(),"kb");\n');
                newpass = newpass.concat('SaveKB("mykb.kbb",G("kb"),2);\n');
                newpass = newpass.concat('\n@@CODE');
                break;
            case newPassType.DECL:
                newpass = newpass.concat('@DECL\n\n');
                newpass = newpass.concat('MyFunction(L("let")) {\n');
                newpass = newpass.concat('\n');
                newpass = newpass.concat('}\n');
                newpass = newpass.concat('\n@@DECL');
                break;
        }
        return newpass;
    }
    createPassItemFromFile(filePath) {
        const passItem = new PassItem();
        passItem.uri = vscode.Uri.file(filePath);
        passItem.name = this.base(filePath);
        passItem.typeStr = path.extname(filePath).substring(1);
        passItem.comment = '# comment';
        passItem.text = this.passString(passItem);
        passItem.empty = false;
        return passItem;
    }
    passFileName(passName) {
        return passName.concat('.nlp');
    }
    getFolderPasses(type, name, includeStubs = false) {
        const passes = Array();
        let collect = '';
        for (const pass of this.getPasses()) {
            if (collect.length == 0 && pass.typeStr.localeCompare(type) == 0 && pass.name.localeCompare(name) == 0) {
                collect = pass.name;
                if (includeStubs)
                    passes.push(pass);
            }
            else if (collect.length) {
                if (pass.typeStr.localeCompare('end') == 0 && pass.name.localeCompare(collect) == 0) {
                    if (includeStubs)
                        passes.push(pass);
                    break;
                }
                else {
                    passes.push(pass);
                }
            }
        }
        return passes;
    }
    getPasses() {
        if (this.passItems.length == 0) {
            this.init();
        }
        visualText_1.visualText.findFilesWithExtension('.nlp');
        this.libraryFileCheck();
        return this.passItems;
    }
    getPassFileUris(topFlag) {
        const files = new Array();
        let infolder = false;
        for (const pass of this.getPasses()) {
            if (topFlag) {
                if (pass.typeStr == 'folder') {
                    infolder = true;
                }
                else if (pass.typeStr == 'end') {
                    infolder = false;
                }
            }
            if (!infolder && pass.typeStr == 'nlp' && pass.uri && pass.uri.fsPath.length > 4)
                files.push(pass.uri);
        }
        return files;
    }
    getSequenceFile() {
        let uri = visualText_1.visualText.analyzer.getSpecDirectory();
        if (uri.fsPath.length)
            uri = vscode.Uri.file(path.join(visualText_1.visualText.analyzer.getSpecDirectory().fsPath, visualText_1.visualText.ANALYZER_SEQUENCE_FILE));
        return uri;
    }
    getLibraryDirectory() {
        return vscode.Uri.file(visualText_1.visualText.getVisualTextDirectory(visualText_1.visualText.ANALYZER_SEQUENCE_FOLDER));
    }
    getSpecDirectory() {
        return visualText_1.visualText.analyzer.getSpecDirectory();
    }
    saveType(seqItem, type) {
        const passItem = this.findPass(seqItem.type, seqItem.name);
        if (passItem.exists()) {
            passItem.typeStr = type;
            passItem.active = true;
            this.saveFile();
        }
    }
    saveActive(seqItem, active) {
        const passItem = this.findPass(seqItem.type, seqItem.name);
        if (passItem.typeStr == 'folder') {
            const passes = this.getFolderPasses(passItem.typeStr, passItem.name);
            for (const pass of passes) {
                pass.active = active;
            }
            passItem.active = active;
            let last = passes[passes.length - 1];
            last = this.nextPass(last);
            last.active = active;
            this.saveFile();
        }
        else if (passItem.exists()) {
            passItem.active = active;
            this.saveFile();
        }
    }
    saveFile() {
        this.newcontent = '';
        for (const passItem of this.passItems) {
            if (this.newcontent.length)
                this.newcontent = this.newcontent.concat('\n');
            this.newcontent = this.newcontent.concat(this.passString(passItem));
        }
        fs.writeFileSync(path.join(this.specDir.fsPath, visualText_1.visualText.ANALYZER_SEQUENCE_FILE), this.newcontent, { flag: 'w+' });
    }
    movePass(seqItem, direction) {
        const passItem = this.findPass(seqItem.type, seqItem.name);
        let row = passItem.row;
        if (passItem.isRuleFile()) {
            if (direction == moveDirection.UP) {
                const prev = this.passItems[row - 1];
                this.swapItems(passItem, prev);
            }
            else {
                const next = this.passItems[row + 1];
                this.swapItems(passItem, next);
            }
        }
        else {
            const nextTop = this.nextTop(passItem);
            const prevTop = this.prevTop(passItem);
            if (direction == moveDirection.DOWN && nextTop.isFolder()) {
                const passesOne = this.getFolderPasses(seqItem.type, seqItem.name, true);
                const passesTwo = this.getFolderPasses(nextTop.typeStr, nextTop.name, true);
                const totalPassCount = passesOne.length + passesTwo.length - 1;
                let i = 0;
                const top = passesOne[0].row;
                for (i = 0; i < passesOne.length; i++) {
                    const pass = this.passItems[top];
                    this.moveCount(pass, totalPassCount);
                }
            }
            else if (direction == moveDirection.UP && prevTop.isFolder()) {
                const passesOne = this.getFolderPasses(prevTop.typeStr, prevTop.name, true);
                const passesTwo = this.getFolderPasses(seqItem.type, seqItem.name, true);
                const totalPassCount = passesOne.length + passesTwo.length - 1;
                let i = 0;
                const top = passesOne[0].row;
                const len = passesOne.length;
                for (i = 0; i < len; i++) {
                    const pass = this.passItems[top];
                    this.moveCount(pass, totalPassCount);
                }
            }
            else {
                let passes = this.getFolderPasses(seqItem.type, seqItem.name, true);
                if (direction == moveDirection.UP) {
                    row--;
                }
                else {
                    passes = passes.reverse();
                    row += passes.length;
                }
                let other = this.passItems[row];
                for (const pass of passes) {
                    this.swapItems(other, pass);
                    this.saveFile();
                    other = pass;
                }
            }
        }
        this.renumberPasses();
    }
    renumberPasses() {
        let passNum = 1;
        let row = 1;
        for (const passItem of this.passItems) {
            passItem.row = row++;
            if (passItem.isRuleFile())
                passNum++;
            passItem.passNum = passNum;
            const pause = 1;
        }
        this.passItems;
    }
    moveCount(passItem, count) {
        let i = 0;
        let pass = passItem;
        let next = passItem;
        for (i = passItem.row; i < count + passItem.row; i++) {
            next = this.passItems[i + 1];
            this.swapItems(pass, next);
            pass = next;
        }
        this.passItems;
    }
    prevNLP(passItem) {
        let row = passItem.row;
        let prev = this.passItems[--row];
        while (prev.typeStr.localeCompare('nlp') != 0) {
            prev = this.passItems[--row];
        }
        return prev;
    }
    prevTop(passItem) {
        let row = passItem.row;
        let prev = this.passItems[--row];
        while (prev.inFolder || prev.typeStr.localeCompare('end') == 0) {
            prev = this.passItems[--row];
        }
        return prev;
    }
    nextPass(passItem) {
        let row = passItem.row;
        const next = this.passItems[++row];
        return next;
    }
    nextTop(passItem) {
        let row = passItem.row;
        let next = this.passItems[++row];
        while (next.inFolder) {
            next = this.passItems[++row];
        }
        if (next.typeStr.localeCompare('end') == 0)
            next = this.passItems[++row];
        return next;
    }
    swapItems(itemOne, itemTwo) {
        const hold = new PassItem();
        this.copyItem(hold, itemOne);
        this.copyItem(itemOne, itemTwo);
        this.copyItem(itemTwo, hold);
        this.swapAuxFiles(itemOne, itemTwo, textFile_1.nlpFileType.TXXT);
        this.swapAuxFiles(itemOne, itemTwo, textFile_1.nlpFileType.KBB);
    }
    copyItem(toItem, fromItem) {
        toItem.text = fromItem.text;
        toItem.name = fromItem.name;
        toItem.tokenizer = fromItem.tokenizer;
        toItem.typeStr = fromItem.typeStr;
        toItem.inFolder = fromItem.inFolder;
        toItem.uri = fromItem.uri;
        toItem.comment = fromItem.comment;
        toItem.active = fromItem.active;
    }
    swapAuxFiles(itemOne, itemTwo, type) {
        const logFile = new treeFile_1.TreeFile();
        const oneFile = logFile.anaFile(itemOne.passNum, type).fsPath;
        const swapFile = oneFile + ".swap";
        const twoFile = logFile.anaFile(itemTwo.passNum, type).fsPath;
        const oneExists = fs.existsSync(oneFile);
        const twoExists = fs.existsSync(twoFile);
        if (oneExists && twoExists) {
            fs.copyFileSync(oneFile, swapFile);
            fs.copyFileSync(twoFile, oneFile);
            fs.copyFileSync(swapFile, twoFile);
            dirfuncs_1.dirfuncs.delFile(swapFile);
        }
        else if (oneExists) {
            dirfuncs_1.dirfuncs.rename(oneFile, twoFile);
        }
        else if (twoExists) {
            dirfuncs_1.dirfuncs.rename(twoFile, oneFile);
        }
    }
    findPass(type, name) {
        const row = 1;
        const found = false;
        for (const passItem of this.passItems) {
            if (type.localeCompare(passItem.typeStr) == 0 && name.localeCompare(passItem.name) == 0) {
                return passItem;
            }
        }
        return new PassItem();
    }
    findPassFromUri(filepath) {
        const found = false;
        for (const passItem of this.passItems) {
            if (filepath == 'tokenizer pass' || filepath == passItem.uri.fsPath) {
                return passItem;
            }
        }
        return new PassItem();
    }
    choicePasses(specDir, items, indent = '', includeTokFlag = true) {
        this.setSpecDir(specDir);
        this.getPassFiles(specDir);
        for (const pass of this.getPassItems()) {
            if (pass.typeStr.localeCompare('folder')) {
                if (pass.tokenizer && includeTokFlag) {
                    items.push({ label: pass.typeStr, description: 'tokenizer pass' });
                }
                else {
                    const uri = this.passItemUri(pass);
                    if (fs.existsSync(uri.fsPath))
                        items.push({ label: indent + path.basename(uri.fsPath), description: uri.fsPath });
                }
            }
        }
    }
    choiceRulePasses(specDir, items) {
        this.setSpecDir(specDir);
        this.getPassFiles(specDir);
        const nlp = new nlp_1.NLPFile();
        for (const pass of this.getPassItems()) {
            const contextLine = nlp.getContextLine(pass.uri);
            if (contextLine.length) {
                items.push({ label: path.basename(pass.uri.fsPath), description: pass.uri.fsPath });
            }
        }
    }
    getSisterFiles(filePath) {
        const items = [];
        let name = path.basename(filePath);
        const tokens = name.split('_');
        if (tokens.length > 1) {
            name = tokens[0];
        }
        for (const item of visualText_1.visualText.analyzer.seqFile.getPassItems()) {
            if (!(item.name === name) && item.name.startsWith(name))
                items.push({ label: path.basename(item.uri.fsPath), description: item.uri.fsPath });
        }
        return items;
    }
    hasSisterFile(filename) {
        const seqItems = this.getPassItems();
        for (const item of seqItems) {
            const base = item.name;
            if (!(base === filename) && (this.compareSisters(base, filename) || this.compareSisters(filename, base)))
                return true;
        }
        return false;
    }
    compareSisters(filename1, filename2) {
        return filename2.length > filename1.length && filename2.startsWith(filename1 + "_");
    }
    getLibraryFile(filepath) {
        const name = path.basename(filepath);
        const count = visualText_1.visualText.getLibraryFiles().length;
        for (const file of visualText_1.visualText.getLibraryFiles()) {
            const base = path.basename(file);
            if (base === name) {
                return file;
            }
        }
        return "";
    }
}
exports.SequenceFile = SequenceFile;
//# sourceMappingURL=sequence.js.map