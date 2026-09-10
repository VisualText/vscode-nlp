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
import { startLanguageServer, stopLanguageServer } from './client/languageClient';
import { registerEngineDiagnostics } from './language/engineDiagnostics';
import { registerTreeGraph } from './treeview/treeGraphView';
import { registerDebugger } from './debug/debugConfig';
import * as telemetry from './telemetry/telemetry';

// What activate() hands back as `extension.exports`. The language server starts
// asynchronously (it is a separate process), so anything that needs to observe a
// language feature -- the integration suite, most obviously -- has to be able to
// wait for it. Without this the only option is a sleep, which passes locally and
// flakes on a loaded CI runner.
export interface NlpExtensionApi {
    languageServerReady: Promise<void>;
}

export function activate(ctx: vscode.ExtensionContext): NlpExtensionApi {
    // Telemetry goes first: it is a no-op unless an endpoint is configured, and
    // instrumentCommands has to patch registerCommand before the views below
    // register theirs. Both respect the user's opt-outs at send time.
    telemetry.activate(ctx);
    telemetry.instrumentCommands();

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
    // Outline, hover, definition, references, rename, completion, signature help,
    // folding, semantic tokens, quick fixes, structural diagnostics and formatting
    // all live in the language server now (dist/server.js). Failing to start it
    // must not take the rest of the extension down with it -- the tree views and
    // analyzer commands are independent of it.
    const languageServerReady = startLanguageServer(ctx).catch(err => {
        vscode.window.showErrorMessage(
            `NLP++ language server failed to start: ${err instanceof Error ? err.message : String(err)}`);
    });
    registerEngineDiagnostics(ctx); // inline squiggles from the engine's err.log
    registerTreeGraph(ctx); // linguistic parse-tree graphic for .tree files
    registerDebugger(ctx); // replay debugger over the analyzer's per-pass tree dumps

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
        // Zero-padded throughout: an unpadded stamp ("2026-8-31 9:5:3") is ragged in
        // the header and does not sort as text alongside a two-digit one.
        const pad = (n: number) => String(n).padStart(2, '0');
        const stamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
            ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
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

    return { languageServerReady };
}

// VS Code disposes everything in ctx.subscriptions for us; what is left are the
// two bare intervals and the telemetry buffer, which would otherwise keep
// running and drop the last interval's counts as the window closes.
export function deactivate(): Thenable<void> {
    try {
        visualText.disposeTimers();
    } catch {
        // Nothing useful to do on the way out; never let shutdown throw.
    }
    telemetry.deactivate();
    // Returned so VSCode waits for the server process to exit before unloading
    // the host. ctx.subscriptions would dispose the client anyway, but disposal
    // is fire-and-forget and can leave an orphaned node process behind.
    return stopLanguageServer().catch(() => { /* already gone */ });
}
