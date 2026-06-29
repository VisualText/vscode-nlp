import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { visualText } from './visualText';
import { ETIME } from 'constants';

// One entry in the Help tree view. `page` is a path under Help/markdown/ (no .md).
export interface HelpItem {
    label: string;
    page: string;
    icon: string;
    isVersionRoot?: boolean;
    isAnnounceRoot?: boolean;
    isPromptRoot?: boolean;
    collapsible?: boolean;
    expanded?: boolean;
    children?: HelpItem[];
    cmd?: string;        // run this command instead of opening a markdown page
    promptFile?: string; // an LLM-prompt file under prompts/ to fill + open
}

export class HelpTreeDataProvider implements vscode.TreeDataProvider<HelpItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<HelpItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    refresh(): void { this._onDidChangeTreeData.fire(); }

    getTreeItem(item: HelpItem): vscode.TreeItem {
        const collapse = item.collapsible
            ? (item.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed)
            : vscode.TreeItemCollapsibleState.None;
        const ti = new vscode.TreeItem(item.label, collapse);
        ti.iconPath = new vscode.ThemeIcon(item.icon);
        // Items can run a command, open an LLM prompt, or open a markdown page;
        // parent nodes just expand.
        if (item.cmd) {
            ti.command = { command: item.cmd, title: item.label };
        } else if (item.promptFile) {
            ti.command = { command: 'helpView.openPrompt', title: item.label, arguments: [item] };
        } else if (!item.collapsible && !item.isVersionRoot && item.page) {
            ti.command = { command: 'helpView.openVscodeHelp', title: 'Open Help', arguments: [item] };
        }
        return ti;
    }

    getChildren(item?: HelpItem): HelpItem[] {
        if (!item) {
            return [
                { label: 'Home', page: 'vscode/home', icon: 'home' },
                { label: 'NLP++ Textbook', page: 'NLP++_Textbook', icon: 'book' },
                { label: 'Quick Start', page: 'vscode/quickstart', icon: 'rocket' },
                { label: 'LLM Prompts', page: '', icon: 'comment-discussion', isPromptRoot: true, collapsible: true },
                { label: 'Regression Testing', page: 'vscode/testing', icon: 'beaker' },
                { label: 'Compiling Analyzers', page: 'vscode/compiling', icon: 'gear' },
                { label: 'Lazy Loading', page: 'vscode/lazyload', icon: 'symbol-array' },
                {
                    label: 'NLP++', page: '', icon: 'symbol-namespace', collapsible: true,
                    children: [
                        { label: 'About NLP++', page: 'NLP_PP_Stuff/About_NLP++', icon: 'book' },
                        { label: 'Variables', page: 'NLP_PP_Stuff/About_NLP++_Variables', icon: 'symbol-variable' },
                        { label: 'Tokens', page: 'NLP_PP_Stuff/Tokens', icon: 'symbol-key' },
                        { label: 'String Functions', page: 'Table_of_String_Functions', icon: 'symbol-string' },
                        { label: 'Node / Parse Tree Functions', page: 'Table_of_Parse_Tree_Functions', icon: 'list-tree' },
                        { label: 'Knowledge Base Functions', page: 'Table_of_Knowledge_Base_Functions', icon: 'database' },
                        { label: 'Math Functions', page: 'Table_of_Math_Functions', icon: 'symbol-operator' },
                        { label: 'Array Functions', page: 'Table_of_Array_Functions', icon: 'symbol-array' },
                        { label: 'Formatting & I/O Functions', page: 'Table_of_Formatting_and_I_O_Functions', icon: 'output' },
                        { label: 'Special Functions', page: 'Table_of_Special_Functions', icon: 'symbol-misc' },
                    ],
                },
                { label: 'Announcements', page: '', icon: 'megaphone', isAnnounceRoot: true, collapsible: true, expanded: true },
                { label: 'Version Notes', page: '', icon: 'history', isVersionRoot: true, collapsible: true, expanded: true },
            ];
        }
        if (item.isVersionRoot) {
            return helpView.listVersionNotes().map(v => (
                { label: v, page: 'vscode/versions/' + v, icon: 'tag' } as HelpItem));
        }
        if (item.isAnnounceRoot) {
            return helpView.listAnnouncements().map(a => (
                { label: a, page: 'vscode/announcements/' + a, icon: 'megaphone' } as HelpItem));
        }
        if (item.isPromptRoot) {
            return helpView.listPrompts().map(p => (
                { label: p.title, page: '', icon: 'sparkle', promptFile: p.file } as HelpItem));
        }
        if (item.children) {
            return item.children;
        }
        return [];
    }
}

export let helpView: HelpView;
export class HelpView {

    panel: vscode.WebviewPanel | undefined;
    exists: boolean;
    ctx: vscode.ExtensionContext;
    helpTreeProvider: HelpTreeDataProvider;
    helpTree: vscode.TreeView<HelpItem>;

    constructor(private context: vscode.ExtensionContext) {
        vscode.commands.registerCommand('helpView.lookup', (resource) => this.lookup(resource));
        vscode.commands.registerCommand('helpView.windowCHMHelp', (resource) => this.windowCHMHelp(resource));
        vscode.commands.registerCommand('helpView.openHelpIndex', () => this.openHelpIndex());
        vscode.commands.registerCommand('helpView.openFunctionHelp', () => this.openFunctionHelp());
        vscode.commands.registerCommand('helpView.openVariableHelp', () => this.openVariableHelp());
        vscode.commands.registerCommand('helpView.openHome', () => this.openHome());
        vscode.commands.registerCommand('helpView.openVscodeHelp', (item) => this.openVscodeHelp(item));
        vscode.commands.registerCommand('helpView.refreshHelp', () => this.helpTreeProvider.refresh());
        vscode.commands.registerCommand('helpView.createClaudePrompt', () => this.createClaudePrompt());
        vscode.commands.registerCommand('helpView.openPrompt', (item) => this.openPrompt(item));
        vscode.commands.registerCommand('helpView.showLatestAnnouncement', () => this.showLatestAnnouncement());
        this.exists = false;
        this.ctx = context;
        this.panel = undefined;
        this.helpTreeProvider = new HelpTreeDataProvider();
        this.helpTree = vscode.window.createTreeView('helpView', { treeDataProvider: this.helpTreeProvider });
    }

    static attach(ctx: vscode.ExtensionContext) {
        if (!helpView) {
            helpView = new HelpView(ctx);
        }
        return helpView;
    }

    lookup(resource: vscode.Uri) {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const cursorPosition = editor.selection.start;
            const wordRange = editor.document.getWordRangeAtPosition(cursorPosition);

            if (wordRange) {
                const word = this.getTerm(editor, wordRange);
                visualText.displayHelpFile(word, word);
            }
        }
    }

    getTerm(editor: vscode.TextEditor, wordRange: vscode.Range): string {
        let term = editor.document.getText(wordRange);
        if (wordRange.start.character > 0) {
            const startPos = new vscode.Position(wordRange.start.line, wordRange.start.character - 1);
            const endPos = new vscode.Position(wordRange.end.line, wordRange.end.character);
            const dollarRange = new vscode.Range(startPos, endPos);
            const dollarWord = editor.document.getText(dollarRange);
            if (dollarWord[0] == '$')
                term = dollarWord;
        }
        return term;
    }

    getWebviewContent(term: string): string {
        const dir = path.join(visualText.getVisualTextDirectory('Help'), 'helps');
        const htmlFile = path.join(dir, term + '.htm');
        if (fs.existsSync(htmlFile)) {
            const html = fs.readFileSync(htmlFile, 'utf8');
            return html + '<br><br><br>';
        }
        return 'Not found: ' + term;
    }

    windowCHMHelp(resource: vscode.Uri) {
        if (os.platform() == 'win32') {
            const helpPath = path.join(visualText.getVisualTextDirectory('Help'), 'Help.chm');
            if (fs.existsSync(helpPath)) {
                const cp = require('child_process');
                cp.exec(`"${helpPath}"`, (err, stdout, stderr) => {
                    if (err) {
                        console.error('Error opening help file:', err);
                        vscode.window.showErrorMessage(`Failed to open help file: ${err.message}`);
                        return;
                    }
                    console.log('stdout: ' + stdout);
                    console.log('stderr: ' + stderr);
                });
            } else {
                vscode.window.showErrorMessage(`File does not exist: ${helpPath}`);
            }

        } else {
            vscode.window.showInformationMessage('Couldn\'t open Windows help file');
        }
    }

    openHelpIndex() {
        this.displayMarkdownHelp('index');
    }

    openFunctionHelp() {
        this.displayMarkdownHelp(path.join('NLP_PP_Stuff', 'Functions'));
    }

    openVariableHelp() {
        this.displayMarkdownHelp(path.join('NLP_PP_Stuff', 'About_NLP++_Variables'));
    }

    displayMarkdownHelp(relativeName: string) {
        const mdFile = path.join(visualText.getVisualTextDirectory('Help'), 'markdown', relativeName + '.md');
        if (fs.existsSync(mdFile)) {
            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(mdFile));
        } else {
            vscode.window.showErrorMessage(`Help file does not exist: ${mdFile}`);
        }
    }

    openHome() {
        this.displayMarkdownHelp('vscode/home');
    }

    openVscodeHelp(item: HelpItem) {
        if (item && item.page)
            this.displayMarkdownHelp(item.page);
    }

    // ----- LLM prompt library -------------------------------------------------

    private promptsDir(): string {
        return path.join(visualText.getVisualTextDirectory('Help'), 'markdown', 'vscode', 'prompts');
    }

    // Machine-specific values substituted into {{...}} placeholders in prompt files.
    private promptVariables(): { [name: string]: string } {
        const engineDir = visualText.engineDirectory().fsPath;
        const exeName = os.platform() === 'win32' ? 'nlp.exe' : 'nlp';
        const cur = visualText.getCurrentAnalyzer();
        return {
            engineExe: path.join(engineDir, exeName),
            engineDir: engineDir,
            visualTextDir: visualText.getVisualTextDirectory(),
            analyzersDir: visualText.getVisualTextDirectory('analyzers'),
            templatesDir: visualText.getVisualTextDirectory('analyzer-templates'),
            languagesDir: visualText.getVisualTextDirectory('languages'),
            miscDir: visualText.getVisualTextDirectory('misc'),
            currentAnalyzer: (cur && cur.fsPath && cur.fsPath.length > 1) ? cur.fsPath : '(no analyzer loaded)',
        };
    }

    private fillPromptVariables(text: string): string {
        const vars = this.promptVariables();
        return text.replace(/\{\{(\w+)\}\}/g, (m, name) => (vars[name] !== undefined ? vars[name] : m));
    }

    // Prompt files: prompts/<file>.md whose FIRST line is the title (shown in the
    // Help tree) and the rest is the prompt body. Returns them sorted by file name.
    listPrompts(): { file: string; title: string }[] {
        const dir = this.promptsDir();
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => f.toLowerCase().endsWith('.md'))
            .sort()
            .map(f => {
                const first = (fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)[0] || '').replace(/^#+\s*/, '').trim();
                return { file: f, title: first || f.replace(/\.md$/i, '') };
            });
    }

    // Read a prompt file, drop its title line, fill ${...} variables, and open the
    // result in a new editor ready to paste into an LLM.
    async openPromptByFile(file: string) {
        const full = path.join(this.promptsDir(), file);
        if (!fs.existsSync(full)) {
            vscode.window.showErrorMessage(`Prompt file not found: ${full}`);
            return;
        }
        const raw = fs.readFileSync(full, 'utf8');
        const nl = raw.indexOf('\n');
        const body = nl >= 0 ? raw.slice(nl + 1) : '';
        const content = this.fillPromptVariables(body).replace(/^\s+/, '');
        const doc = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
    }

    openPrompt(item: HelpItem) {
        if (item && item.promptFile)
            this.openPromptByFile(item.promptFile);
    }

    // The toolbar button / quickstart link: open the first prompt in the library,
    // or fall back to a built-in one if the prompt content isn't installed.
    async createClaudePrompt() {
        const list = this.listPrompts();
        if (list.length) {
            await this.openPromptByFile(list[0].file);
            return;
        }
        const v = this.promptVariables();
        const prompt =
`I want you to help me write a prototype NLP++ analyzer. NLP++ is a rule-based programming language for natural language processing, run by the NLP engine. Everything you need is already installed on this machine at the paths below:

- NLP engine executable (run analyzers with this): ${v.engineExe}
- Example analyzers (study these for patterns and the pass sequence): ${v.analyzersDir}
- Analyzer templates (good starting points for a new analyzer): ${v.templatesDir}
- VisualText support files: ${v.visualTextDir}
    - Library functions and language dictionaries / knowledge bases: ${v.languagesDir}
    - Misc library functions: ${v.miscDir}

An NLP++ analyzer is a folder containing: spec/ (the .nlp passes plus analyzer.seq, the ordered pass sequence), input/ (text files to analyze), and kb/ (the knowledge base). Before writing anything, read several of the example and template analyzers above to learn the analyzer.seq format, the pass structure, and the library functions and KB conventions available in the languages and misc directories. Run an analyzer by invoking the engine executable above on an input file.

Create a folder of text files from the internet that (FILL IN YOUR DESCRIPTION) and create an analyzer that does (FILL IN YOUR DESCRIPTION OF THE ANALYZER).`;
        const doc = await vscode.workspace.openTextDocument({ content: prompt, language: 'markdown' });
        await vscode.window.showTextDocument(doc);
    }

    helpExists(relativeName: string): boolean {
        return fs.existsSync(path.join(visualText.getVisualTextDirectory('Help'), 'markdown', relativeName + '.md'));
    }

    // Version-note files live at Help/markdown/vscode/versions/<version>.md. Only
    // significant releases get one. Returns the versions present, newest first.
    listVersionNotes(): string[] {
        const dir = path.join(visualText.getVisualTextDirectory('Help'), 'markdown', 'vscode', 'versions');
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => f.toLowerCase().endsWith('.md'))
            .map(f => f.replace(/\.md$/i, ''))
            .sort((a, b) => this.compareVersions(b, a));
    }

    // Announcement files live at Help/markdown/vscode/announcements/<id>.md and
    // are keyed by id (not version) — name them so they sort newest-first (e.g.
    // a date prefix like 2026-06-29-...). Returns the ids present, newest first.
    listAnnouncements(): string[] {
        const dir = path.join(visualText.getVisualTextDirectory('Help'), 'markdown', 'vscode', 'announcements');
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
            .filter(f => f.toLowerCase().endsWith('.md'))
            .map(f => f.replace(/\.md$/i, ''))
            .sort((a, b) => b.localeCompare(a));
    }

    // Numeric dotted-version compare: returns >0 if a>b, <0 if a<b, 0 if equal.
    compareVersions(a: string, b: string): number {
        const pa = a.split('.').map(n => parseInt(n, 10) || 0);
        const pb = b.split('.').map(n => parseInt(n, 10) || 0);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const d = (pa[i] || 0) - (pb[i] || 0);
            if (d !== 0) return d;
        }
        return 0;
    }

    private extensionVersion(): string {
        const v = this.ctx.extension?.packageJSON?.version;
        return (typeof v === 'string' && v.length) ? v : (visualText.version || '');
    }

    // Called once on activation. Shows, at most, one popup: a version note (on
    // first install / upgrade) takes priority; otherwise an unseen announcement.
    // Guarded so help never blocks activation.
    showStartupHelp() {
        try {
            if (!this.checkVersionNotes())
                this.checkAnnouncements();
        } catch {
            // Help should never break activation.
        }
    }

    // On a first install, opens the help home. On an upgrade, opens the newest
    // version note the user hasn't seen yet (a note exists only for releases the
    // developers marked significant). Returns true if it opened something.
    checkVersionNotes(): boolean {
        const key = 'nlp.helpLastSeenVersion';
        const current = this.extensionVersion();
        const lastSeen = this.ctx.globalState.get<string>(key);

        if (!lastSeen) {
            // First install — show the hub once the help content is present.
            if (this.helpExists('vscode/home')) {
                this.openHome();
                this.ctx.globalState.update(key, current);
                return true;
            }
            return false;
        }

        if (current && this.compareVersions(current, lastSeen) > 0) {
            const next = this.listVersionNotes().find(v =>
                this.compareVersions(v, lastSeen) > 0 &&
                this.compareVersions(v, current) <= 0);
            this.ctx.globalState.update(key, current);
            if (next) {
                this.displayMarkdownHelp('vscode/versions/' + next);
                return true;
            }
        }
        return false;
    }

    // Force-show the newest announcement, ignoring the seen-state. Lets a dev
    // preview an announcement (and a user re-open the latest) on demand, instead
    // of relying on the once-per-id startup popup.
    showLatestAnnouncement() {
        const list = this.listAnnouncements();
        if (list.length === 0) {
            vscode.window.showInformationMessage('No announcements found.');
            return;
        }
        this.displayMarkdownHelp('vscode/announcements/' + list[0]);
    }

    // Announcements are broadcast independently of the extension version: drop a
    // new file under announcements/ (e.g. via a VisualText files content update)
    // and it shows once, on the next relogin. Seen ids are tracked in globalState.
    // Shows the newest unseen announcement and marks all present ones seen (so an
    // old backlog never pops). Returns true if it opened something.
    checkAnnouncements(): boolean {
        const key = 'nlp.helpSeenAnnouncements';
        const present = this.listAnnouncements();          // newest first
        if (present.length === 0) return false;
        const seen = this.ctx.globalState.get<string[]>(key) ?? [];
        const unseen = present.find(a => !seen.includes(a));
        // Mark every current announcement seen, whether or not we show it.
        this.ctx.globalState.update(key, present);
        if (unseen) {
            this.displayMarkdownHelp('vscode/announcements/' + unseen);
            return true;
        }
        return false;
    }
}
