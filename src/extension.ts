import * as vscode from "vscode";
import * as path from "path";
import { VisualText } from './visualText';
import { AnalyzerView } from './analyzerView';
import { NLPCommands } from "./command";
import { SequenceView } from './sequenceView';
import { TextView } from './textView';
import { KBView } from './kbView';
import { OutputView } from './outputView';
import { FindView } from './findView';
import { HelpView } from './helpView';
import { LogView } from './logView';
import { NLPStatusBar } from './status';
import { visualText } from './visualText';
import { registerFormatter } from './format/formatProvider';
import { registerLanguageFeatures } from './language/providers';
import { registerEngineDiagnostics } from './language/engineDiagnostics';
import * as telemetry from './telemetry/telemetry';

export function activate(ctx: vscode.ExtensionContext): void {
    TextView.attach(ctx);
    LogView.attach(ctx);
    VisualText.attach(ctx);
    AnalyzerView.attach(ctx);
    OutputView.attach(ctx);
    SequenceView.attach(ctx);
    KBView.attach(ctx);
    FindView.attach(ctx);
    const help = HelpView.attach(ctx);
    NLPCommands.attach(ctx);
    NLPStatusBar.attach(ctx);
    registerFormatter(ctx);
    registerLanguageFeatures(ctx); // outline, hover, go-to-definition, structural diagnostics
    registerEngineDiagnostics(ctx); // inline squiggles from the engine's err.log
    telemetry.activate(ctx); // no-op unless a connection string is configured

    // First-run welcome / new-version notes / announcements (guarded; never
    // blocks activation). Shows at most one popup, version notes taking priority.
    help.showStartupHelp();

    vscode.commands.executeCommand('setContext', 'textView.fastload', visualText.getTextFastLoad());

    // #849: stamp the "# MODIFIED:" header line with the current date/time when an
    // NLP++ pass file is saved. onWillSaveTextDocument + waitUntil applies the edit
    // atomically with the save, so there is no re-save loop and no on-disk conflict.
    // Only files that already carry the header line (created from the pass template)
    // are touched.
    ctx.subscriptions.push(vscode.workspace.onWillSaveTextDocument(e => {
        const ext = path.extname(e.document.fileName).toLowerCase();
        if (ext !== '.nlp' && ext !== '.rec' && ext !== '.pat')
            return;
        const now = new Date();
        const stamp = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate() +
            ' ' + now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds();
        const newLine = '# MODIFIED: ' + stamp;
        const max = Math.min(e.document.lineCount, 15);
        for (let i = 0; i < max; i++) {
            const line = e.document.lineAt(i);
            if (/^#\s*MODIFIED:/i.test(line.text)) {
                if (line.text.trimEnd() !== newLine)
                    e.waitUntil(Promise.resolve([vscode.TextEdit.replace(line.range, newLine)]));
                return;
            }
        }
    }));

    if (visualText.getAutoUpdate())
        visualText.startUpdater();
    else
        visualText.debugMessage("Auto update on reload is off");
}
