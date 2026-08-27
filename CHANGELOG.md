# Change Log
All notable changes to the [VSCode NLP++ extension](http://vscode.visualtext.org) will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

### 3.12.14
The KB view shows what a dictionary or knowledge base is for on mouse-over.

- **Hovering a `.dict` or `.kbb` file in the KB view shows the comment written at the top of it**, instead of the file's path on disk. The path tells you where the file lives -- something the tree already makes obvious -- while the header comment is where the author wrote down what the file holds, and it was visible nowhere but inside the file. The same idea the Sequence view picked up for pass comments in 3.12.13.
- The opening comment paragraph is shown rather than only its first line, so a description that runs across two or three lines arrives whole instead of stopping mid-sentence. A bare `#` closes the paragraph, which keeps a long file header down to its opening statement. Both `#` line comments and `/* */` block comments are understood.
- A file with no header comment keeps the path tooltip exactly as before -- `en-full.kbb` opens straight onto `dictionary`, so nothing changes for it. Files toggled off (`.dictt`, `.kbbb`) read their comment the same way as the active ones.
- Only the head of each file is read, and what it yields is held until the file changes on disk. The KB view rebuilds every row on every refresh and `en-full.kbb` is 10MB, so the body of a lexicon is never touched to draw a tooltip.

### 3.12.13
The Sequence view shows the pass's comment on mouse-over.

- **Hovering a pass in the Sequence view shows what the comment on that line of `analyzer.seq` says**, instead of the pass file's path on disk. The path told you where the file lives -- something the tree already makes obvious -- while the comment is where the author wrote down what the pass is for, and it was visible nowhere but the sequence file itself.
- A pass with no comment, or one still carrying the placeholder `# comment` the extension writes on a new pass, falls back to the file path exactly as before. Tokenizers keep their built-in description unless the line has a comment of its own, and a pass whose file is missing still says `MISSING`.
- Folders, Python passes, and rule passes all read their comment the same way, and both `#` line comments and `/* */` block comments are understood.

### 3.12.12
Comments and blank lines in `analyzer.seq` survive the Sequence view.

- **A hand-written `analyzer.seq` is no longer mangled.** The sequence parser required three tab-separated columns and rebuilt the whole file from the parsed fields on every edit, so a file written by hand rather than by the extension came apart: a `#` comment line lost its first word (`# StatuteFrames -- ...` came back as `# -- ...`), and a comment line short enough to be under three columns -- `#` on its own, a `# ------` rule, a blank line -- was dropped from the file entirely the next time a pass was moved or renamed.
- **A pass with no trailing comment is no longer dropped.** `nlp<TAB>initKB` is two columns, so it never registered as a pass at all: it vanished from the Sequence view and from the file. Two columns is now a whole pass, and one written without a comment is saved back without a trailing tab.
- **Comment and blank lines stay out of the Sequence view.** They used to become empty rows -- a 10-line file header meant ten blank entries above the first pass. They are now attached to the pass below them and written back byte for byte, so the tree shows passes only. Block comments (`/* */`) get the same treatment, which also fixes the empty rows they left behind since 3.12.4.
- **Comments stay where you put them.** A section header keeps its place when passes are reordered around it, and deleting the first pass under one hands the header to the pass that follows instead of taking it along. Hand-aligned comment columns keep their spacing.

### 3.12.11
Compiling an analyzer is much faster.

- **A full compile of a large analyzer now takes about 30 seconds instead of 10-15 minutes.** Compiling was spending nearly all its time re-reading the same engine headers: parse-en-us generates 520 knowledge-base source files plus 139 rule files, and each 80 KB generated file pulls in about 4.5 MB of headers -- the same headers, once per file. Those sources are now batched together so the headers are read once per batch. On Windows there was a second problem on top of that: the build asked for four parallel jobs, but the setting it used parallelises *projects*, and an analyzer is a single project, so every file was compiling one after another no matter what. Both are fixed.
- Requires NLP Engine 3.8.7 or later, which adds include guards the batched build needs. On an older engine the extension detects that and compiles exactly as it did before, so nothing breaks -- upgrade the engine and the speedup appears on its own.

### 3.12.10
The copy icon on an LLM prompt now copies the prompt.

- **Copying a prompt from the Help view gives you the finished text, not a file path.** The inline copy icon on the LLM Prompts was the same "Copy File Path" action every other help item gets, so it handed back a location on disk -- something an LLM cannot read and you would have to open yourself. It now copies the prompt exactly as it would be handed to an LLM, with the `{{...}}` placeholders already replaced by this machine's paths: the engine executable, the analyzers and templates directories, the currently loaded analyzer, and the rest. Paste it and it works.
- The title line and the internal tooltip marker are dropped, the same way they already were when you clicked a prompt to preview it -- so the icon and the click now produce identical text.
- Markdown help pages are unchanged: their copy icon still copies the path.

### 3.12.9
Telemetry: recognise shipped example analyzers that live in nested folders.

- The `example` tag on `analyzer.run` was only set when a run's folder name matched a **top-level** shipped folder, so examples nested inside grouping folders (e.g. `nlp-tutorials/`, `nlpfix-analyzers/`) were never recognised and counted as a user's own analyzer. Detection is now **path-based**: an analyzer run from anywhere under the shipped `analyzer-templates` or `analyzers` directories is named, at any depth. A user's own analyzer still never qualifies.

### 3.12.8
Telemetry can now say which of the shipped examples people actually use.

- **Running or creating one of the analyzers this extension ships now records its name.** Until now the question "which examples are worth maintaining?" was unanswerable: analyzer runs deliberately left the name out, and creating an analyzer was not recorded at all. The templates and the analyzers from the [analyzers](https://github.com/VisualText/analyzers) repository are a fixed, public set, so naming one says nothing about you -- the same way a command id does not.
- **Your own analyzers are still never named.** The name is checked against the folders the extension downloads from those public repositories, and anything else is left out of the record entirely rather than replaced with a placeholder. Because the list comes from those folders rather than being written into the extension, a template added to either repository is covered without waiting for a release.
- **The Telemetry section of the README says all of this**, as does `SECURITY.md`. The old wording promised that analyzer names were never sent, which this would have made untrue; it now promises that the names *you* create are never sent, and states the exception plainly.
- Creating an analyzer also records which template you started from and how many blocks you combined -- template names only, never the name you gave the analyzer.
- **Smaller download.** The bundle drops about 120 KB: `del` is gone, replaced by Node's own `fs.rmSync`, which does the same job for the two places that used it.

Nothing here is retroactive. It answers the question from this release onward.

### 3.12.7
Two failures that only ever showed up away from a developer's machine.

- **The extension could fail to activate at all.** `getExtensionPath()` looked for an installed copy of the extension under the extensions directory, and read `extensionItems[-1].uri` when it found none -- throwing `Cannot read properties of undefined (reading 'uri')` straight out of `activate()`. Nothing registered after that: no command, no view, no provider, and one line in a log to explain it. Having no installed copy is the *normal* state whenever the extension runs from source rather than the marketplace -- F5 development on a clean machine -- so it stayed invisible on any machine that already had it installed. It now falls back to where the running code actually lives.
- **The analyzer directory was never remembered.** `analyzer.directory` is written to your settings on every activation, but it was never declared in the extension's configuration, and VS Code rejects writes to settings it does not know about. The write failed every single time, silently, so an analyzer folder outside the workspace was re-derived from the engine directory on each start instead of persisting.
- **Six commands are gone from the Command Palette.** `nlp.opendisplayMatchedRules`, `sequenceView.reveal`, `sequenceView.changeTitle`, `analyzerView.deleteFileLogs`, `logView.matches` and `logView.setClearFlag` were declared but never registered, so choosing any of them produced "command not found". Four were leftovers from renames; their working replacements -- `nlp.displayMatchedRules`, `textView.deleteFileLogs`, `outputView.matches` and `logView.clear` -- are unaffected.
- Under the hood, every pull request now runs the test suites on GitHub Actions, including a new one that launches a real VS Code and checks that the extension activates and that all 218 declared commands are registered. That suite is what found the first two items above.

### 3.12.6
Corrected label in the README screenshot.

- **The logging panel was labeled "Text Being Analyzed".** That label already belonged to the editor at the top of the shot, so the bottom-right panel — which shows the per-stage timings from an analyzer run — carried a name for something else entirely. It now reads **Log Window**.
- The alt text follows the image, and also picks up the dictionary panel it had been skipping.

### 3.12.5
A labeled screenshot at the top of the README.

- **The hero screenshot now names what you are looking at.** The previous image showed the full environment but left a newcomer to work out which panel was which, and the caption could only list them in prose. Each region is now labeled in the image itself: the development corpus, the NLP pipeline of passes, the text being analyzed, the parse tree graphic, the rule matches display, the output tree, dictionaries and knowledge bases, the knowledge base output, analyzer run output, the analyzer list, help including LLM prompts, and the run log. Clicking it still opens the full-size view.
- The image is palettized to 256 colors, which is visually identical on flat editor chrome and keeps the package from growing by a megabyte.
- Also folds in a `.vscodeignore` fix from the 3.12.4 branch that never reached master: the test-harness build output (`out-format/`, `out-language/`, `out-treeview/`) is kept out of the `.vsix`.

### 3.12.4
Block comments are live: the NLP++ engine now parses `/* */`.

- 3.12.3 added `blockComment` and the on-Enter rule that continues a block comment, but held the release because the engine still knew only `#` line comments -- writing `/* */` in a pass file died with `[Syntax error.]`. **Engine 3.7.14 ships that support**, so **Toggle Block Comment** (`Shift+Alt+A`) now produces something the analyzer will actually build.
- Block comments work in pass files (`.nlp`/`.pat`) and in the line-oriented data files (`.seq`, `.kb`, `.dict`, `.kbb`). They follow C: they do not nest (the first `*/` closes), a delimiter inside a string or after a `#` is ordinary text, and an unterminated `/*` is reported as an error.
- **The data formats now colorize them too.** `.dict`, `.kbb` and `.kb` grammars knew only `#`, so a block comment in one of those files read as ordinary content; all three have a block-comment rule now, and `blockComment` in their language configurations makes `Shift+Alt+A` work there as well.
- **`.seq` and `.kb` files are colorized at all.** Grammars for both shipped with the extension but were never registered, so analyzer sequences and knowledge-base dumps opened as plain text.
- **Block comments inside `@RULES` regions and `[...]` attribute blocks** are colorized. Those two contexts pulled in the line-comment rule only. (A block comment containing `@@` still closes the region early — TextMate checks a region's end pattern before its contents.)
- **A multi-line `/* */` folds.** Registering a folding provider replaces VSCode's indentation fallback, which had left block comments as the one thing in a pass file that could not be collapsed.
- **The analyzer-sequence editor no longer mangles a commented pass.** A `/* ... */` line in `analyzer.seq` was parsed as a pass named `*` — a leading `/` already means "inactive pass" — and, because reordering a pass rewrites the whole file from parsed fields, the comment was destroyed on the next edit. Comment lines are now recognized and written back verbatim.
- **Byte-sort keeps comments attached.** Sorting a `*full.dict` / `*full.kbb` treated a block-comment line as an entry keyed `/*`. Comments now travel with the entry they precede, the way `#` comments already did, and a file holding a multi-line comment is reported rather than sorted — the engine's lazy dictionary load rejects that file anyway, since a binary-search seek cannot tell it landed inside a comment.
- **Requires nlp-engine 3.7.14 or later.** On an older engine the syntax colouring still treats `/* */` as a comment, but the analyzer will not build.

### 3.12.3
Standard editor behaviors for NLP++ files (language configuration).

- **Word selection** (`wordPattern`) — `_noun`, `_ROOT`, and `$var` now select, rename, and find-references as a single word instead of splitting on `_`/`$`.
- **Auto-indent** (`indentationRules`) — code indents inside `{ }` / `( )` and after `@CODE`/`@DECL`/`@PRE`/`@POST`/`@CHECK`, and outdents on `}` / `)` / `@@`.
- **On-Enter rules** — `#` line comments continue on Enter; braces open with smart indentation; and C-style `/* */` block comments continue with ` * `.
- **Block-comment toggling** (`Shift+Alt+A`) — enabled via `blockComment`. Note: this depends on `/* */` support landing in the NLP++ engine; hold the Marketplace publish until the engine ships it.

### 3.12.2
The screenshot at the top of the README opens full size.

- The new hero screenshot shows six panels at once, which makes it small enough that the parse tree and the knowledge-base output can't be read at the width a README renders at. **Clicking it now opens the full-size image**, on both GitHub and the Marketplace, rather than doing nothing.

### 3.12.1
The README describes the extension as it exists today.

- **The front page had stopped keeping up.** "What's New in Version 3" covered compiling analyzers and stopped there, at 3.1 — so nothing shipped since was mentioned anywhere: the parse-tree graphic, the whole IDE language-intelligence layer added across 3.5.0–3.9.0, the formatter, the regression runner, the Help sidebar, the LLM prompt library. A third of the file was a second copy of this changelog, 24 entries deep, ending at a 2022 release; it now links here instead. The result is about 60% of the previous length and describes the current extension.
- **Local compilation was documented as the default, and it hasn't been since 3.4.6.** Anyone reading the README was told they needed a C++ toolchain, CMake ≥ 3.16 and Visual Studio Build Tools before they could compile — which is exactly the requirement the cloud compile service exists to remove. Cloud is the default and is now described as such.
- **New sections on what NLP++ actually is.** A comparison against regex and LLMs across determinism, auditability, linguistic structure, world knowledge, fixability and cost; and an explanation that an analyzer is four things working together — the parse tree, rules, dictionaries and knowledge bases, and the functions that reach into all three — rather than the "rule-based" label it usually gets. Also new: how NLP++ and LLMs work together, the built-in prompt library, the [NLP Foundation](https://nlp.foundation), the Python and Node packages that run analyzers outside the editor, and a reading list from the [VisualText blog](https://visualtext.org/category/blog/).
- **The screenshot is from 2020 no longer.** The new one shows the parse-tree graphic, a dictionary, knowledge-base output and the run log at once.
- The development instructions now clone with `--recurse-submodules`. Without it the grammar submodule added in 3.11.14 is missing and the build is broken.
- The extension had **no `keywords`** in its manifest, so Marketplace search had nothing but the description to match against. Added.

### 3.12.0
Anonymous telemetry that can actually answer a question, and empty folders are back in the analyzer view.

- **Five events could not describe an extension with 224 commands.** Telemetry recorded activation, two formatter events and which run mode an analyzer used — so there was no way to tell which features anyone touches, whether the language intelligence added in 3.5.0 gets used, or how often a compile fails and why. Command usage is now recorded for every contributed command by wrapping command registration once at startup, rather than by touching the eleven view files that register them, and the deliberate language features — hover, go to definition, find references, rename, completion, signature help — count a use only when they actually returned something. Both are batched in memory and flushed once a minute, so a command like **Refresh All** costs one row a minute instead of one per click.
- **Compiling was entirely unmeasured**, which is awkward for the feature the cloud compile service exists to rescue. A compile now reports its target, its route (local or cloud), whether it succeeded, and how long it took. Failures carry a fixed stage name rather than a message: `no-cmake` and `no-engine-libs` are recorded separately, so "how many people simply cannot build locally" is finally a number. Cloud builds add the platform, whether the build was a cache hit, how long the runner made the user wait, and the payload size.
- **Analyzer runs now report the timing breakdown they were already computing.** The setup / engine startup / KB load / analyzer load / exec / post-processing split shown in the log view was discarded; it is now recorded alongside the run mode, so where time actually goes in the field is visible per mode. A failed run records only whether it was a syntax or an execution error.
- Engine downloads and unzips, regression runs, and compiled-analyzer deployments report success, counts and elapsed time. Every record now carries CPU architecture and the installed engine version, which is what decides whether a compiled library can load at all, and activation distinguishes a fresh install from an upgrade from an ordinary relaunch.
- **Nothing new is sent about your work.** No file contents, no file or analyzer names, no paths, and no error message text — a failure is reported as a fixed reason string chosen in the source, or at most an error class name, because messages routinely quote paths and rule source. The two existing opt-outs are unchanged and either one still switches everything off: VS Code's global `telemetry.telemetryLevel`, and `nlp.telemetry.enable`. Counts are not even buffered while telemetry is off, so turning it on cannot send back history. The README lists every category collected.
- **A folder with nothing in it now shows.** Filtering the view down to analyzers took empty folders with it, so creating a folder to move analyzers into looked like the folder was never created. An empty folder is exactly where analyzers are about to go, so it stays visible. Folders with an empty folder somewhere below them stay visible too, which keeps a freshly made `Projects/Group A` reachable.
- Folders holding only other content — a corpus of text files, notes, fixtures — are still hidden, as are loose files.

### 3.11.17
The analyzer view shows analyzers, not a file browser.

- **Only analyzers and the folders that group them appear.** The view listed every file and folder it found, so a workspace holding anything besides analyzers — a README, notes, corpora, fixtures, scratch directories — buried the analyzers in unrelated entries. An entry now survives only if it is an analyzer or has an analyzer somewhere beneath it. Nested layouts are unaffected: a grouping folder stays visible, at any depth, as long as something under it is an analyzer.
- The search stops at an analyzer (analyzers do not nest inside one another), skips `_log` and `_test` folders, and is depth-capped, so expanding the tree does not walk into a `node_modules` or a checked-out engine directory.
- Note that **Rename File**, **Delete File** and **Generate Manifest** only ever appeared on file entries and are no longer reachable from this view.

### 3.11.16
Analyzers without an `input` folder are analyzers again.

- **The analyzer view was demoting real analyzers to plain folders.** A directory only counted as an analyzer if `spec`, `kb` **and** `input` all existed on disk, so an analyzer whose `input` folder was empty or absent lost its gear icon, its right-click analyzer commands and its place in the analyzer lists. Git never stores empty directories, which made this routine: clone an analyzer repo and the input folder simply isn't there. Recognition now keys off `spec/analyzer.seq` — the pass sequence that actually defines an analyzer, and the same test `analyzerFolderCount()` has always used to decide whether a workspace holds analyzers at all.
- This makes it practical to publish an analyzer with **no input text at all**, which matters when the sample documents contain sensitive material and shouldn't be committed.
- **The input folder is recreated on open.** Opening an analyzer that has no `input` directory now creates one, so the Text view has somewhere to put files. Without it, **New Folder** in the Text view failed outright on the missing parent directory.

### 3.11.15
More highlighting gaps closed, found by building a second colorizer.

- **`!` now colorizes.** The operator rule had `!=` but not bare `!`, so the logical not in `if (!L("con"))` was uncolored everywhere — 2,620 occurrences in the English parser alone. `<<` and `>>` were missing too, which is what `cout` and file output use constantly.
- **Array subscripts colorize.** Square brackets are a rule element's modifier block inside `@RULES`, but an array subscript in code, and the two go through different parts of the grammar. Function calls and operators inside a subscript — `L("arr")[L("i") + 1]` — were being left plain.
- **Rule attributes like `[min=0 max=2]`** now colorize their `=` and their numbers, the way the `match=(...)` form always did.

These surfaced while writing an NLP++ lexer for [Pygments](https://pygments.org), which powers highlighting on Wikipedia, Sphinx, Jupyter and LaTeX. A TextMate grammar never complains about text it can't match, so the gaps had been invisible for years; Pygments flags every unmatched character, which made them impossible to miss.

### 3.11.14
Syntax highlighting fixes, and the grammars now live in their own repository.

- **Operators colorize at last.** `>`, `<`, `=`, `<>`, `&&`, `||`, `++`, `--`, `==`, `!=`, `<=` and `>=` were all wrapped in word-boundary anchors that punctuation can never satisfy, so not one of them was ever highlighted. `<>` was also ordered after `<` and could never match as a single token, and `++`, `--`, `&&` and `||` were missing from the rule entirely.
- **`_xWILD`, `_xNUM`, `_xWHITE` and the rest colorize as constants** inside `@RULES` regions instead of as ordinary tokens. The constant rule existed but was losing a tie to the general token rule and never won.
- A number at the very first character of a file now colorizes.
- The **Colorize Analyzer** template gives wildcard nodes and operators explicit colors in both light and dark themes — teal for `_xWILD` and friends, blue for operators — rather than leaving the two newly-fixed scopes to whatever the active theme happens to do with them.
- The TextMate grammars moved to [VisualText/nlpplus-tmbundle](https://github.com/VisualText/nlpplus-tmbundle) and are pulled in here as a submodule, so GitHub, Shiki, `bat` and other tools can colorize NLP++ using exactly the grammars this extension ships. Contributors should clone with `--recurse-submodules`.
- Smaller download — the package no longer carries per-module `tsc` output and source maps that were never loaded.

### 3.11.13
LLM prompts can point at the help files.

- Prompt files can now use a `{{helpDir}}` placeholder, filled in with your machine's `Help/markdown` directory. The **Prime Claude for NLP++** prompt uses it to send Claude to the per-function help pages and the `vscode/home.md` index instead of guessing function signatures.

### 3.11.12
NLP++ math functions: `floor`, `ceiling`, `round` and friends.

- The editor now knows the new engine math builtins — `floor`, `ceiling`, `round`, `truncate`, `sqrt`, `pow` and `log` — so they colorize as functions and offer completions and snippets.
- Also registers `abs`, `mod` and `randomint`, which the engine has had for a while but which were never added to the grammar or language data (they had snippets but showed up unhighlighted).

### 3.11.11
Parse-tree graphic: stagger overlapping labels at every level.

- The overlap-aware staggering now applies to **all** node levels — parts of speech and phrase labels, not just the bottom row of words. Long internal labels that used to overlap (e.g. `_substantivo`, `determinante`) now split into as few extra rows as needed, and each level expands vertically only when it has collisions. Levels that fit stay on one line.

### 3.11.10
Parse-tree graphic: smarter leaf staggering.

- Leaf labels now stagger vertically **only where they would actually overlap**, using the minimum number of rows needed — instead of always offsetting every other leaf. When labels don't collide (or you spread the tree out with Shift+scroll), they **fall back into a single line**. The result is cleaner: no needless stair-stepping, and no overlapping node names.

### 3.11.9
Parse-tree graphic: "Reveal Text" on the right-click menu for any node.

- Right-click **any** node in the parse-tree graphic — phrase nodes as well as words — and choose **Reveal Text** to select that node's span in the analyzed input file. (Left-clicking a word still reveals it; this adds it to the menu and extends it to phrase nodes, which reveal the whole phrase's text.) ([#1105](https://github.com/VisualText/vscode-nlp/issues/1105))

### 3.11.8
Opening an LLM prompt now copies it to the clipboard.

- Clicking an LLM prompt in the Help view (or the "Create Claude Prompt" toolbar button) still shows the filled-in prompt, and now also **copies it to the clipboard**, with a notification — so you can paste it straight into your LLM without selecting and copying by hand. ([#1104](https://github.com/VisualText/vscode-nlp/issues/1104))

### 3.11.7
Fix the delay opening files after running an analyzer.

- Running an analyzer writes knowledge-base files, and each newly created `.nlp`/`.pat`/`.kbb` file was triggering a **full re-index of every such file in the workspace**. Those repeated rebuilds tied up the extension while you were trying to open a tree file. A new or changed file is now indexed **on its own**, and file changes cost nothing at all until the cross-pass index is actually needed. Analyzer log folders are also skipped when indexing.
- Opening a tree file also no longer waits on the analyzer colorization step, which re-read (and sometimes rewrote) the workspace `.vscode/settings.json` on **every** file open. It now runs at most once per session and happens *after* the file is displayed, so tree, pass, and rule-match files come up immediately.

### 3.11.5
Opening tree files is instant; the graphic is strictly on-demand.

- Opening a `.tree` file no longer does any graphic-related work, so it comes up instantly like any text file.
- The parse-tree **graphic (webview) starts only when you ask for it** — the title-bar tree icon or the right-click menu. It never opens on its own.

### 3.11.4
Version alignment — no functional changes from 3.11.3.

- Republishes the 3.11.3 parse-tree graphic improvements under a fresh version number so the Marketplace and repository stay in sync after a publishing mix-up. See 3.11.3 below for the feature list.

### 3.11.3
Parse-tree graphic: instant opening, global menu, and horizontal spacing control.

- **Opens instantly.** The graphic window now appears immediately on click and the tree is drawn a tick later, so a large tree never blocks. Very wide nodes (like the flat tokenizer row of hundreds of tokens) start collapsed, so the first draw is always small and fast.
- **Right-click anywhere** for **Center all**, **Expand all**, and **Collapse all** (right-clicking a phrase node still adds Expand/Collapse all *below* that node).
- **Tighter default spacing** so trees read more compactly, and **Shift+scroll** squeezes or spreads the horizontal space between nodes on the fly.
- **Staggered leaf labels** — alternate leaves sit slightly lower so long word/token labels no longer overlap when packed close together.

### 3.11.2
Parse-tree graphic: rendering and interaction fixes.

- **Fixed "black squares" on large trees.** A very wide tree gave the SVG a huge intrinsic size that overflowed the browser's max texture size and rendered as black tiles. The graphic now fills the view and zooms/pans within it, so it renders cleanly at any size.
- **Bigger click targets.** Each node now has a generous invisible hit area (with a hover highlight), and collapse markers are larger — no more hunting for a tiny dot.
- **Right-click a node → Expand all below / Collapse all below**, to open or close a whole subtree at once (shown only for nodes that have children).

### 3.11.1
Parse-tree graphic: drill-down and right-click graphing.

- The graphic opens with just the root expanded; clicking a phrase node reveals only that node's immediate children (which stay collapsed), so you drill down one node at a time instead of opening whole levels. Small trees still open fully.
- New right-click items on a `.tree` file: **Graph Entire Tree**, and **Graph Selected Portion of Tree** — graphs the selected lines, or (with no selection) the subtree under the cursor's line, so you can visualize just one phrase.

### 3.11.0
Collapsible nodes and faster opening for the parse-tree graphic.

- **Click a phrase node to collapse or expand** its subtree — large trees stay manageable, and you can drill into just the part you care about.
- **Opening is instant**: the graphic reuses a single panel, large trees open collapsed (below depth 2) so the first draw is small, and the tree **fits to the window** on open. Collapsing keeps your zoom/pan.
- Clicking a **word (leaf)** still reveals its span in the analyzed text.

### 3.10.0
Draw the parse tree as a linguistic tree graphic.

- A new **View Parse Tree Graphic** button on the `.tree` editor title bar opens a graphical, alternative view of the parse tree beside the text — the classic linguistic tree diagram drawn as SVG. **Scroll to zoom, drag to pan, and click any node** to reveal its text span in the analyzed input file.
- The whitespace tokens and pass banners are hidden for a cleaner tree; the same view works from any `.tree` file (tokenizer passes render flat and wide, later phrase-structure passes render as proper trees).

### 3.9.1
Hovering a built-in function now links to that function's own help page.

- The built-in-function hover previously offered a link to the general Functions help page. It now links directly to the specific function's markdown help (`Help/markdown/<name>.md`), falling back to the aggregate Functions page for the few built-ins without a dedicated page.

### 3.9.0
Add semantic highlighting and quick fixes for NLP++.

- **Semantic highlighting** colors identifiers by what they are — built-in function, your own `@DECL` function, KB concept, rule, or `N/S/X/G/L` node accessor each get a distinct color, layered on top of the existing syntax coloring.
- **Quick fixes** for misspelled function calls: a call like `pnvarr(...)` that closely matches a real function (`pnvar`) is flagged with a warning and a one-click "Replace with…" fix. It only fires when there's a close match, so it stays quiet on ordinary variables and new identifiers.

### 3.8.0
Add code folding for NLP++ pass files.

- Regions (`@RULES`, `@CODE`, `@DECL`, …) can now be collapsed, and each multi-line rule inside an `@RULES` region folds on its own — making long pass files much easier to scan and navigate.

### 3.7.0
Add signature help for NLP++ function calls.

- Typing inside a function call's argument list now shows the callee's signature and highlights the argument you're on. Your own `@DECL` functions show their full parameter list (resolved across passes); built-in functions show a name-only signature.
- The enclosing-call detection works on the tokenized source, so parens and commas inside strings or comments don't throw it off, and nested calls resolve to the innermost function.

### 3.6.0
Add context-aware IntelliSense completion for NLP++.

- Autocomplete in `.nlp`/`.pat` files, filtered by where the cursor is: typing `@…` suggests **region markers** (`@RULES`, `@CODE`, `@DECL`, …); **code regions** suggest built-in functions, keywords, `N/S/X/G/L` node accessors, and your own `@DECL` functions; **rule regions** suggest rule-element modifiers (`opt`, `star`, `plus`, `trig`, …), KB concepts, and rule names from across the analyzer.
- Draws on the same workspace index and built-in tables as the 3.5.0 navigation features; completion for your rules/functions/concepts updates as you edit.

### 3.5.0
Add IDE language-intelligence for NLP++ pass files.

- New language providers for `.nlp`/`.pat` files: **Outline & breadcrumbs**, **Hover** docs for built-in functions/keywords/`@region` markers, **Go to Definition** (same-file, cross-pass, and KB concepts in `.kbb`), **Find All References**, **occurrence highlighting**, **Rename Symbol** (declared rules/functions/concepts), and **Workspace Symbol** search (Ctrl-T).
- **Diagnostics**: a structural linter (bracket balance, unterminated comments) plus inline squiggles parsed from the analyzer's `err.log`, so compile/analyze errors appear in the editor and the Problems panel and map back to the offending pass or `.dict` file.
- Implemented in `src/language/` as pure, editor-agnostic analysis engines with thin VSCode adapters (mirroring the formatter), reusing the existing region splitter and tokenizer.

### 3.4.7
Fix a crash when deploying a compiled analyzer.

- **Deploy Compiled Analyzer to Folder** no longer fails with `ENOENT ... copyfile ... <analyzer>.dll` when the destination folder doesn't already exist. The top-level library copy added in 3.4.5 ran before the destination directory was created; the deploy now creates the target folder first.

### 3.4.6
Compile now defaults to the cloud service out of the box.

- `compile.mode` now defaults to **`cloud`** (was `local`), and `compile.dispatcherUrl` now defaults to the hosted dispatcher `https://nlp-compile-dispatcher.dehilster.workers.dev`. Compiling an analyzer works with no local C++ toolchain and no configuration; switch `compile.mode` to `local` to build with CMake on your own machine. ([#1086](https://github.com/VisualText/vscode-nlp/issues/1086))

### 3.4.5
Deployed compiled analyzers now include the top-level library.

- **Deploy Compiled Analyzer to Folder** now also writes the top-level `<analyzer>.dll` (alongside the `bin/{run,runu,kb,kbu}` copies the engine loads at run time). The deployed folder now opens and runs as an analyzer in the extension — **Run (Compiled)** finds the library — and shows the expected `.dll`/`.so`/`.dylib` artifact. (Run it with an engine of the same architecture as the compiled library.)

### 3.4.4
Deploy compiled analyzers with their python-pass scripts, and expand the Version 3 docs.

- **Deploy Compiled Analyzer to Folder** now also stages `spec/*.py` (and an analyzer-level `python/` folder, if present) into the deployed folder. A compiled `python` pass shells out to `spec/<script>.py` at run time, so those scripts must ship; the `.nlp` rule source is still left out. Requires engine 3.7.10+ for compiled python passes. The completion notice now also reminds you to run the deployed folder with an engine of the same architecture as the compiled library.
- Rewrote the README's "What's New in Version 3" section (compiled analyzers, granular compile targets, run modes, cloud compile, deploy, lazy dictionaries, compiled python passes, in-editor markdown help).

### 3.4.3
Deploy a stand-alone compiled analyzer to a separate folder.

- New "Deploy Compiled Analyzer to Folder" command exports a runnable, stripped compiled analyzer: `bin/{run,runu,kb,kbu}` (the compiled library) plus only the lazy `*full.dict`/`*full.kbb` files, with `spec/`, `input/`, and the non-full `.kb`/`.dict` sources omitted. Requires a prior "Compile Analyzer and KB" and an engine that opens the lazy full files when the KB is compiled.

### 3.4.2
Show each lazy-loaded KB and dictionary file in the analyzer log.

- The analyzer LOGGING summary only reported lazy-load timings when an eager `Loaded knowledge base` line was also present. The engine now lazy-loads the KB itself, which *replaces* that line, so the lazy-load info silently disappeared. It now renders independently of that line.
- Each lazy-loaded file gets its own line, e.g. `Lazy-loaded en-full.kbb: 0.28 sec`. The per-type read time is shown on the first file of each type (`.kbb`, `.dict`); additional files of the same type are marked `(incl. above)`, since the engine reports one combined read time per type.

### 3.4.1
Add a "copy file path" action to the Help view.

- File-backed items in the Help view (markdown help pages and LLM prompt files) now show an inline **copy** icon on hover; clicking it copies the file's full local path to the clipboard. Category headers and external Helpful Links (which aren't local files) don't show it.

### 3.4.0
Add anonymous, opt-out usage telemetry.

- The extension can now send **anonymous usage data** — counts and metadata only (which features are used, analyzer run mode, extension/VS Code version, platform, and handled errors) — to help prioritize work and catch problems in the field. It **never** sends file contents, analyzer/KB/dictionary source, file names, paths, or any text being analyzed. The only identifier is VS Code's already-anonymized `machineId`.
- Fully opt-out and respected on two independent switches: VS Code's global `telemetry.telemetryLevel` and the new **`nlp.telemetry.enable`** setting. If either is off, nothing is sent. See the Telemetry section of the README.

### 3.3.0
Add a full document formatter for NLP++ (`.nlp`/`.pat`) files.

- **Format Document** (Shift+Alt+F / format on save) and **Format Selection** (Ctrl+K Ctrl+F) now work on NLP++ pass files. The formatter is region-aware: it reflows `@RULES`/`@MULTI` rule blocks (one element per line with an aligned, auto-numbered `### (N)` comment column) and re-indents `@DECL`/`@CODE`/`@PRE`/`@POST`/`@CHECK` code with tabs and Allman braces. Preamble/header regions pass through untouched.
- **Rigorous and safe.** The engine is built on a lossless tokenizer, so strings and comments can never be corrupted. Every region is emitted only if formatting it is a fixpoint *and* leaves the rule's semantic "spine" (its elements and attributes) unchanged — so a reformat can never alter what a rule matches. Verified idempotent and lossless across a corpus of 11,000+ real `.nlp` files.
- **Fixes a latent bug** shared with the existing "Reformat Rule" command: the reformatter was silently dropping an attribute bracket on the suggested/rewrite node (`_ENDRULE [base] <-` became `_ENDRULE <-`, affecting 10,000+ rules in the wild). The full node is now preserved.
- Configurable via `nlp.format.*` settings: `enable`, `indentStyle` (tabs/spaces/editor), `tabSize`, and `braceStyle` (allman/keep).

### 3.2.32
Fix rule reformatting leaving a doubled node number in the comment.

- Reformatting a comment where a node number was glued to the annotation — e.g. `_word ### (2) (2)moose and stuff` (or `### (2)moose and stuff`) — now strips the whole leading run of `(N)` (spaced or glued to the following word) and produces `### (2) moose and stuff`, instead of keeping the extra number. A parenthesized number in the *middle* of an annotation (e.g. `### see rule (3) here`) is still preserved. ([#1077](https://github.com/VisualText/vscode-nlp/issues/1077))

### 3.2.31
Fix rule reformatting of numbered comments that carry annotations.

- Reformatting a rule whose element comments include an annotation after the node number — e.g. `_amount ### (2) beginning of year` — no longer keeps the old number in the comment and append a second one (`### (2) beginning of year (2)`). The reformatter now recognizes the auto-generated `(N)` whether it was written just after `###` (number-first) or at the end (number-last), strips it, and re-emits the comment as `### (N) annotation`, preserving the user's text. A parenthesized number in the *middle* of an annotation (e.g. `### see rule (3) for details`) is left untouched. ([#1065](https://github.com/VisualText/vscode-nlp/issues/1065))
- **Sequence view menu**: **Insert Python Library Pass Before Tokenizer** moved up to just after the **Library Pass** submenu (it previously sat down in the tokenize group). It still appears only when right-clicking a tokenizer pass.

### 3.2.30
Sequence view menu tweak.

- **Sequence view menu**: the **Python Library** pass insert moved into the **Library Pass** submenu (it's a library pass), listed first — just under the "Library Pass" heading — instead of in the new-pass type menu.

### 3.2.29
Stop the updater from re-downloading the VisualText files every cycle.

- The VT files existence check still looked for a `visualText/analyzers` folder, but that folder was **renamed to `analyzer-templates`** in the visualtext files. The stale name was never found, so the updater treated the VisualText files as permanently missing and re-downloaded/re-unzipped them on every update check. The check now looks for `analyzer-templates`.
- The `hier.kb` sync (`checkHierFile`) also pointed at the removed `analyzers/basic` template; it now reads the baseline from the `Bare Minimum` template under `analyzer-templates` (resolved via the installed engine dir), so a stale analyzer's `hier.kb` is refreshed again.

### 3.2.28
Fix the unzip hang on large engine libraries (the real root cause).

- The updater now extracts zips with the **OS-native extractor** (`bsdtar`, shipped on Windows 10 1803+/11 and macOS) instead of the `extract-zip` library, which was observed to **hang** on large entries — specifically `nlpengine-compile-libs.zip`, whose `words.lib` is 38 MB (the whole zip expands to ~60 MB). Native `tar` extracts that same zip in a fraction of a second; `extract-zip` timed out at 120 s. `extract-zip` remains a fallback where a zip-capable `tar` isn't present (e.g. GNU tar on Linux). This is what was actually causing the recurring "stuck on unzipping" hangs; 3.2.26/3.2.27 kept the partial state from wedging the updater, and this removes the hang itself.

### 3.2.27
Make the updater self-healing and fix the Stop button.

- **Stop now actually stops.** Pressing Stop while an unzip/download was running left the op marked `RUNNING`, which kept the updater loop alive forever — so the stop icon never went away. Stop now abandons in-flight ops (they can't be truly cancelled, but the timer, queue, and `updating.running` state reset immediately).
- **Partial installs self-heal.** The existence check treated any folder that merely *exists* as complete, so an empty `include`/`lib`/`visualText` folder left by an interrupted download was declared "done" — leaving missing files that never got re-fetched. It now treats an **empty folder as missing** and re-downloads.
- **Hung unzip no longer wedges the updater.** A 120s watchdog on extraction turns a hang into a normal failure, so the queue completes and the next run retries instead of sitting at `RUNNING` indefinitely.

### 3.2.26
Fix the updater getting stuck while unzipping `visualtext.zip`.

- The unzip now extracts into a temporary sibling directory and only moves each top-level entry into the engine directory **after the full extraction succeeds**. Previously the extraction wrote directly into the engine dir, so an interrupted unzip (e.g. a window reload mid-extraction) left a **partial tree** that looked like a complete install. The leftover `.zip` then made the updater skip the download and jump straight back to the unzip, which was interrupted again — an endless "stuck on unzipping" loop. The source `.zip` is now deleted only after everything is moved into place, so any re-run re-extracts cleanly from scratch.
- **KB view**: `.json` files placed in `kb/user` now appear in the tree (with the JSON icon), so JSON data fed to an analyzer for the `json2kbb` pass is visible alongside the `.kbb` files it generates.

### 3.2.25
Menu tweaks, JSON icon, and orphan-python fix.

- **Toggle Auto Update** added to the Logging view's `⋯` menu (next to Toggle Update Trace), so auto-update can be turned on/off without editing settings.
- **KB view**: "Explore KB Folder" added to the title `⋯` menu, and the help **Video** moved from the title bar into the `⋯` menu.
- **Output view**: "Explore Folder" added to the title `⋯` menu.
- **JSON files** now show a `{ }` JSON icon in the tree.
- **Orphan passes**: clicking the orphan button now shows **python (`.py`) passes** too (previously only `.nlp`/`.pat`), and the orphan check no longer misclassifies them. The same fix applies to Delete Orphans.

### 3.2.24
Fix update loop with multiple extension versions installed.

- The updater's existence check now uses the same engine directory the download/unzip target (`engineDirectory()`). Previously it used `getExtensionPath()`, which could resolve to a **different installed version**, so with several `dehilster.nlp-*` versions present the check looked in one directory while the download populated another — the update never registered as complete and the unzip looped. (Related: #481.)

### 3.2.23
Fix VisualText files update getting stuck.

- Reverts #800's "delete the whole `visualText` directory before downloading". That left the directory empty whenever the following download/unzip stalled, and the missing files re-triggered the updater, so the unzip got stuck in a loop. The updater no longer deletes the directory; the unzip refreshes files in place.

### 3.2.22
Insert Python Library Pass.

- **#882** New **Insert Python Library Pass** on the sequence view: pick a script from the shared `visualText/python/` library (shown with its `# DESC:` descriptor) and it's copied into the analyzer's `spec/` and added to the sequence as a python pass — including a "before the tokenizer" variant on the tokenizer menu. The generic **Insert Python Pass** (blank stub) is unchanged.
- Ships with a **`json2kbb.py`** library script that converts a JSON input file to a KBB in `kb/user/` (the inverse of `KBFuncs.nlp`'s `JsonKB`), so an analyzer can build a KBB from JSON before processing. (Requires the companion VisualText-files release for the script + descriptors.)

### 3.2.21
Issue fixes: spaces in paths, missing sequence file, dict-error line, find options.

- **#123** File/folder names with **spaces** now work — the Explore command and the Python-pass runner quote their paths instead of passing them unquoted to the shell.
- **#770** A missing `spec/` directory or `analyzer.seq` no longer throws/blanks the views — `dirfuncs` guards against reading a non-existent directory, and a clear "Analyzer sequence file missing" warning is shown.
- **#878** Double-clicking a **dictionary error** in the log now jumps to the correct line — a `.dict` error reports the dict line number as its first token, which was being ignored.
- **#157** Find now supports **case-sensitive** and **whole-word** matching via the `nlp.findCaseSensitive` and `nlp.findWholeWord` settings (both off by default, so the default behavior is unchanged).
- **#974** **Duplicate Line** (Ctrl+Shift+D) no longer collapses `\\` to `\` — the duplicated line is inserted as literal text so backslashes are preserved.

### 3.2.20
Help view: Helpful Links.

- A new **Helpful Links** node in the Help view lists external resources (tutorial videos, articles, and the VisualText / NLP++ sites) and opens each in the browser.
- The list is read from an **editable file** shipped in the VisualText files — `Help/markdown/vscode/helpful-links.txt` (one link per line: `Title | https://url | Description`), so links can be added or changed without an extension update.

### 3.2.19
Text view: delete multiple files/folders at once.

- **#755** The Text view now supports **multi-select**: select several files/folders (Ctrl/Shift-click) and delete them in one action. The single-item delete (with its file/directory wording) is unchanged; multi-select shows a "Delete N selected items?" confirmation.

### 3.2.18
Find Results: mark inactive and orphan passes.

- **#787** (partial) Find results now mark **inactive** passes with `I` and **orphan** pass files (a `.nlp`/`.rec`/`.pat` in `spec/` not referenced by the analyzer sequence) with `O`, alongside the pass number added in 3.2.17. Remaining #787 items (rule number, tab-aware char offset, the full `X PASS RULE ELT | LINE,CHAR` format) are still open.

### 3.2.17
Find Results: show pass numbers.

- **#787** (partial) Find results in analyzer pass files are now prefixed with the **analyzer-sequence pass number**, so results read in pass order and the multi-pass progression is visible. Non-pass files (function libraries, input text) are unaffected.

### 3.2.16
Text view clear-all-logs button + modified date on save.

- **#349** The **clear-all-logs** button in the Text view title bar now appears when the analyzer has log directories. The `text.hasLogs` context that gates it was hardcoded to `false`, so the button (and its command) were never shown even though they existed.
- **#849** Saving an NLP++ pass file (`.nlp`/`.rec`/`.pat`) now stamps its `# MODIFIED:` header line with the current date and time. Only files that already carry the header (created from the pass template) are touched, and the update is applied atomically with the save (no re-save loop).

### 3.2.15
Fix VisualText files update leaving residual files.

- **#800** Updating the VisualText files now removes the whole `visualText` directory before re-downloading, so stale/residual files no longer survive an update. The previous per-folder delete built a doubled `visualText/visualText/…` path that matched nothing and deleted nothing.

### 3.2.14
More issue-tracker bug fixes.

- **#898** "Create Mod file when none" now awaits creation before appending, so the mod file is created and selected before the append (previously a race left it not working).
- **#746** Renaming a text file now opens the renamed file **beside** the current editor.
- **#807** Inserting an existing pass whose name is already in the sequence no longer adds a duplicate entry — the file is overwritten in place, keeping the existing pass position.

### 3.2.13
Issue-tracker bug fixes.

- **#915** Analyzer template descriptions now show on Linux — the template picker read `README.MD` (uppercase), which failed on case-sensitive filesystems; it now reads `README.md`.
- **#976** The Text view title now resets to `TEXT` when the newly selected analyzer has no current text file, instead of keeping the previous analyzer's filename.
- **#867** Renaming a pass by only changing letter case is now allowed (the case-insensitive "already exists" check no longer blocks a case-only rename).
- **#786** Commenting code no longer collapses `\\` to `\` (backslashes are escaped before the snippet insert).
- **#791** "Sort / unique lines" now works on a selection instead of being overwritten by a whole-document replace.
- **#741** Deleting a directory in the Text view now says "directory" (title and prompt) instead of "file".
- **#559** File properties now include line and word counts alongside the file size.
- **#497** The Text view gains a **Collapse All** title-bar button.

### 3.2.12
Analyzer summary: report lazy-loaded KB and dictionary separately.

- The lazy-load breakdown under **Loaded knowledge base** now shows **Lazy-loaded KB** (`.kbb`) and **Lazy-loaded dictionary** (`.dict`) as two distinct lines, each with its own on-demand read time, instead of a single combined "Lazy-loaded dictionary" line.
- Each sub-line appears only when that file type was actually lazy-loaded, and both stay indented as a breakdown of the KB-load segment (top-level timings still sum to the total).

### 3.2.11
NLP++ snippets: 91 new function snippets generated from the help documentation.

- Added snippets for documented builtins that previously had none — including `loaddict`/`loadkbb`, math functions (`abs`, `mod`, `logten`, `factorial`, `randomint`), database functions (`dbopen`, `dbexec`, `dbfetch`, …), print/dump functions (`print`, `prtree`, `fprintvar`, `gdump`, …), parse-node functions (`pnpush`, `pnmove`, `pnpushval`, …), and URL/string helpers (`resolveurl`, `urlbase`, `strhaspunct`, `striscaps`, …).
- Added the rule-action reductions (`uppercase`, `lowercase`, `cap`, `length`, `regexp`, `var`, `vareq`, …) in the `<from,to>` element-range form.
- Each snippet's placeholders come from the documented syntax and its description from the help page's Purpose.

### 3.2.10
Lazy-loaded dictionary shown in the analyzer summary.

- When the engine lazy-loads a dictionary (`.dict`/`.kbb`), the analyzer timing summary now lists a **Lazy-loaded dictionary** line under **Loaded knowledge base**, reporting the on-demand read time.
- It appears only when lazy loading is active, and is shown as an indented sub-line (a breakdown of the KB-load segment) so the top-level timings still sum to the total.

### 3.2.9
LLM Prompts open in a rendered preview.

- Clicking a prompt under **LLM Prompts** in the Help tree now opens a **rendered markdown preview** (with `{{variables}}` filled in), consistent with the other help items, instead of the raw markdown editor.
- The raw copy-paste path is unchanged: the **Create Claude Prompt** toolbar button still opens the editable prompt text ready to paste into an LLM.

### 3.2.8
Knowledge Base template default + analyzer load timing.

- The **New Analyzer** template picker now floats the **Knowledge Base** template to the **top of the list**, shows it **pre-checked**, and labels it **(Recommended)** — so it is the default choice.
- The analyze timing summary now reports **analyzer load time** — `Loaded analyzer:` (interpreted) or `Loaded compiled analyzer:` (compiled) — from the new engine output. This surfaces what was previously the largest unaccounted chunk of the total (building/loading the analyzer), and the breakdown still sums exactly to the total.

### 3.2.6
Analyze log: clean timing summary with its own log file.

- The Logging view now shows a **concise, fully-additive timing breakdown** for each analyze — Setup, Engine startup + load, Loaded knowledge base, Exec analyzer time, Post-processing — and the segments **sum exactly to the total** shown on the "Done analyzing …" line.
- The verbose `stdout`/`stderr` dump (command args, paths, `-DEV` output) no longer floods the log on every run. It is still available on demand from the **Display Analyzer Output Files** toolbar button (log icon).
- The summary is written to its own **`analyze.log`** file and can be reloaded any time with the new **Display Analyze Summary** toolbar button (document icon).
- The log now **clears at the start** of each analyze, so every run shows a fresh, self-contained summary (and never clears mid-run).

### 3.2.5
LLM Prompts help tree: hover descriptions.

- Prompt entries in the **LLM Prompts** help tree now show a longer **hover tooltip** describing what each prompt does, read from an optional `<!-- desc: ... -->` line in the prompt file.
- The description marker is stripped when a prompt is opened, so it never appears in the text you paste into the LLM.

### 3.2.4
Analyze logging and run-mode improvements.

- The Logging view now shows the **total analyze time** — "Done analyzing … (2.34 sec)".
- The log **no longer clears when an analysis completes**, so the "Analyzing…" line, the engine output, and the timing all stay visible. A directory analyze now shows every file's result instead of only the last.
- The status-bar run-mode toggle now cycles **Interpreted → Compiled → Compiled KB → Compiled Analyzer**.

### 3.2.3
Toolbar cleanup: moved the **Video** and **Create Claude Prompt** actions (Analyzers view) and **Video** (Output view) from the title bar into the `...` overflow. The Run Regression Test button stays on the Analyzers toolbar.

### 3.2.2
Help announcements, an LLM prompt library, and polish.

- **Announcements**: version-independent broadcast pages (`Help/markdown/vscode/announcements/<id>.md`) that show once per user on the next relogin, even without an extension update. New **Announcements** node in the Help view and a **Show Latest Announcement** (📣) button.
- The **NLP++ Textbook** is now featured on the Help home page and listed in the Help view.
- **LLM Prompts**: a new Help-view node lists reusable prompt files (`Help/markdown/vscode/prompts/<name>.md`) whose `{{...}}` placeholders are filled with this machine's engine/analyzer/library paths and opened in a new editor. Authorable in the VisualText files. **Create Claude Prompt** now opens the first prompt.

### 3.2.0
Added an in-extension Help system and a built-in regression-test runner.

- **Help view** in the NLP++ sidebar plus a 📖 book button on the view toolbars, opening markdown help pages (Quick Start, Compiling, Regression Testing, Lazy Loading) and an **NLP++** reference node (functions, variables, etc.). Help content lives in the VisualText files under `Help/markdown/vscode/`.
- **Version notes**: on first install the Help home opens; on upgrade the newest unseen `versions/<ver>.md` opens automatically (tracked in globalState).
- **Create Claude Prompt to Build an Analyzer** (Help view + Analyzers toolbar): opens a new editor with a generated prompt containing this machine's engine, example/template analyzer, and library paths.
- **Built-in regression runner**: "Run Regression Test" / "Bless Regression Goldens" now run natively and stream `PASS`/`FAIL`/`MISSING` into the **Logging** view (no terminal, no Python dependency). Set `analyzer.regressionTerminal` to use the old `nlp_regress.py` terminal path. A 🧪 test icon and right-click items on each Text-view file/folder scope a run to that item.
- The Logging view now **auto-scrolls** to the newest line, and a regression run **clears the log** before starting.

### 3.1.30
Added a whole-analyzer regression tester to the Analyzers panel.

- New **"Run Regression Test (All Files)"** toolbar button (and analyzer right-click item) runs `nlp_regress.py` over every file in the analyzer's `input/` directory in an "NLP++ Regression" terminal, showing live PASS/FAIL output. It compares the structured extraction semantically (id-stripped, order-insensitive), so it is stable across cosmetic engine drift while still catching real extraction changes.
- New **"Bless Regression Goldens (All Files)"** command captures the goldens. It only shows the overwrite confirmation when goldens already exist under `test/expected/`; the first bless (nothing to overwrite) just creates them.
- Complements the existing per-file, line-by-line "Run Regression Test".

### 3.1.29
Fixed two issues with python passes placed before the tokenizer.

- A python pass now always shows the Python icon. `getPassFiles` was overwriting every pass's uri with `<name>.nlp`, so a python pass pointed at a non-existent `.nlp`, read as "missing", and fell back to the default dot icon. Python passes now keep their `.py` uri.
- Clicking a python pass inserted before the tokenizer now opens its `.py` file. The sequence view treated "pass 1" as the tokenizer (opening the sequence file / tree / rule matches); a python pass at pass 1 is now excluded from that special-casing.

### 3.1.28
Simplified the Python pass type into a single, position-aware pass.

- Removed the separate `pythonpre` flavor. There is now one **Python** pass that runs wherever it sits in the sequence: place it before the tokenizer to run on raw text, or after the tokenizer to run post-tokenization. It is the only pass type allowed before tokenization.
- "Insert > Python" now just prompts for a name (no pre/post choice). The generated `.py` stub documents the positional pre/post behavior the engine passes as its phase argument.
- The tokenizer's right-click menu gains **"Insert Python Pass Before Tokenizer"**, so a python pass can be placed ahead of the tokenizer (previously the menu only inserted after the selected pass).
- Existing `pythonpre` passes are still recognized when read, so older analyzers keep working.

### 3.1.27
Added support for the native **Python pass** type in the analyzer sequence: a Python icon in the sequence tree, an "Insert > Python" command that creates a `.py` stub in `spec/`, and `.py` pass handling in the sequence model.

### 3.1.26
Gave the analyzer-only compile its own library name and a matching run mode.

- "Compile Analyzer Only" now produces `analyzer.dll` (`analyzer.so` / `analyzer.dylib`) instead of `<analyzerName>.dll`; the analyzer-named library is reserved for "Compile Analyzer and KB", which compiles both together.
- The run-mode status bar now cycles through four modes: Interpreted -> Compiled KB -> Compiled Analyzer -> Compiled. In Compiled Analyzer mode the analyzer is run from `analyzer.dll` while the KB stays interpreted.
- The KB view now also surfaces `analyzer.dll` alongside `kb.dll` and the analyzer-named library.

### 3.1.25
Added **"Compile Analyzer Only to C++ Library"**, which invokes `nlp.exe -COMPILEANA` (requires NLP-engine 3.6.0+).

- Regenerates only the analyzer C++ (`run/`) and rebuilds the analyzer library, reusing the already-generated KB C++ (`kb/`) — a fast recompile when only NLP++ rules changed, skipping KB regeneration.
- Available from the Analyzers view title menu and an analyzer's context menu, alongside "Compile Analyzer and KB" and "Compile KB".
- Warns if no KB C++ exists yet (run "Compile Analyzer and KB" or "Compile KB" once first).

### 3.1.10
Added the ability to compile only the knowledge base (KB) and to run an interpreted analyzer against the compiled KB.

- Renamed the existing analyzer compile command to **"Compile Analyzer and KB to C++ Library"** to reflect that it produces both.
- **"Compile KB to C++ Library"** now invokes `nlp.exe -COMPILEKB` and produces `kb.dll` (`kb.so` / `kb.dylib` on Linux/macOS) in the analyzer directory.
- The run-mode status bar now cycles through three modes: Interpreted -> Compiled -> Compiled KB. In Compiled KB mode the analyzer is run interpreted while the compiled KB library is loaded.

### 3.0.0
Added support for compiling analyzers and the knowledge base (KB).
Benefits: faster execution and protection of native NLP++ source code when analyzers are distributed to customers without access to the NLP++ source.

### 2.49.6
Now has different colorization for light and dark themes.

### 2.48.5
Opens the local html files in the browser instead of online.

### 2.47.1
Fixing display for light themes. This is not complete. There must be a way to make it automatifc for textmate colorization. See settings-light.json.

### 2.46.1
Put add mod back into the sequence view.

### 2.45.5
Added load python library files.

### 2.44.4
No longer displaying old KB files.

### 2.43.8
Fixing duplicate pass with folders, the N("$text",1) snippet, and copying context line from file above.

### 2.43.0
Added file comparison to library files in the sequence.

### 2.42.4
Allows for selecting multiple analyzer blocks when creating analyzer and to insert analyzer blocks into an existing sequence.

### 2.40.4
Fixed folder creation and moving.

### 2.39.0
Added highlighting of dictionary matches.

### 2.36.4
Added capability to call Python scripts that run on the text in a text window.

### 2.35.0
Reorganization of library dictionaries, kbs, and mod files

### 2.34.2
Added Portuguese dictionaries in KB context menu.

### 2.33.2
Updated vscode extension path for linux.

### 2.32.3
Added readme files editing in Analyzer window anywhere. Misc fixes.

### 2.31.3
When loading an analyzer, check to see if the hier.kb file needs updating (added the "emoji" path recently).

### 2.30.1
Can now create an ECL file.

### 2.29.1
Removed icu library transfers for Linux and Macos because no longer needed.

### 2.28.11
Fixed error display (again)

### 2.27.3
Overhauled the reformat rule in general. It also now includes the suggested node and ending @@. Also, it now has reformat to one line and reformat with paren attributes listed on separate lines.

### 2.26.2
Added [HPCC Systems](https://github.com/hpcc-systems) manifest file generation to the analyzer view. This allows for sending NLP++ files to the HPCC Server to run using the HPCC Systems NLP++ Plugin.

### 2.25.7
Added fast load option for the TextView for large number of files

### 2.24.4
Can now display fired rules from dictionaries.

### 2.23.0
Enhanced search for sequence files.

### 2.22.2
Can now turn off auto updates.

### 2.21.0
Can now choose log flag for all logs, final logs only, and completely silent.

### 2.20.10
One-level sequence folders should now be working.

### 2.19.4
Adding testing files for regression testing.

### 2.18.0
If a pass exists, replace it when inserting a library pass. This in effect "updates" the file which is often the case with KBFuncs.nlp.

### 2.17.13
Added mod files allowing for saving and loading multiple files together in one file.

### 2.16.3
Put active toggle on sequence passes.

### 2.15.0
Now opening files to the side that are modified or called by a context menu.

### 2.14.6
Renaming now changes header comment. Dupliation intelligently increments end number.

### 2.13.8
Added icon buttons to directly open tutorial videos.

### 2.12.5
Can copy input files and folders to another analyzer. Fixed delete log files bug in the analyzerView. Added icons to the log output lines.

### 2.11.5
Can now move the VisualText editor up or down in the analyzer view.

### 2.10.0
Added library files for dictionaires and KBs.

### 2.9.2
Copy kb files to a sister analyzer.

### 2.8.2
Added toggle active / inactive for kbb and dict files. Added attr and val while loops in snipper.

### 2.7.2
Insert and delete orphan(s), icon variety in KB, duplidate line shortcut in dict and kbb, explore output directory, import analyzer

### 2.6.2
NLP Engine couts are now displayed in the logview after the run.

### 2.5.1
Users can now quickly move an output file to sister analyzer's text or kb.

### 2.4.4
Dict type in output view, explore in sequence view, and bug fixes.

### 2.3.1
Added move file from output to kb directory.

### 2.2.2
Added the ability to copy files to the KB directory.

### 2.1.2
Comments now follow VSCode standard of ctrl-/

### 2.0.2
New version: KB Browser with .dict files and .kbb files which make dictionary and knowledge base building much easier. Is in conjunciton with version 2 of the NLP Engine.

### 1.65.1
Removed boost and used std::filesystem and std::regex

### 1.64.5
Added download of the boost file system library

### 1.63.3
Added new and library pass submenus

### 1.62.4
Added README files to analyzer view

### 1.61.4
Complete overhaul of updater

### 1.60.5
Enhanced error reporting in log view

### 1.59.3
Added move folders to the text view

### 1.58.0
Added folders to the analyzer view

### 1.57.1
Advises on NLP-ENGINE update fail. Also opens file browser for any file or directory on all three platforms.

### 1.56.1
Colorization of NLP++ folders added automatically

### 1.55.3
Added merge .dict files to the KB View context menu

### 1.54.11
Added generate main.kb

### 1.53.11
Added help for special variables with dollar signs

### 1.52.0
Added analyzer processing queue for running multiple folders

### 1.51.2
Added "Split directory" to textview to split large directories into smaller subdirectories

### 1.50.1
Added keybindings for reformat rule, final tree, and pass tree for .nlp and unfold all for .tree

### v1.49.3
Added descriptive tooltip to tokenizer path in the analyzer sequence. Fixed renaming.

### v1.48.0
Add properties to files and folders. Sped up file operations, fixed log deletion bugs, added cancel file operations, added file operation counts display.

### v1.47.5
Added struniquechars to NLP++ and snippets

### v1.46.3
Added refresh treeviews array to fileops

### v1.45.0
Added .dict files to be text files for dictionaries where each meaning for each word occupies one line

### v1.44.0
Added webitekb function

### v1.43.4
Added a KB View List

### v1.42.2
Unicode fixes for colorizing

### v1.42.1
Major fixes to the textview conext menu

### v1.42.0
Check for older pat files more obvious and clean, misc fixes.

### v1.41.7
Added cross reference context menu items in nlp files, tree files, and txxt files

### v1.40.0
Lexer improvements

### v1.39.7
Added duplicate analyzer in the same folder. Fixed delete messages, generate exact rule, deleting analyzer logs, and comments that were removing $ variables.

### v1.38.0
Added fold and unfold recursively in trees and kbb displays

### v1.37.1
Added chartok tokenize which breaks apart all characters

### v1.36.0
Added windows Help.chm file in context menu for windows only

### v1.35.0
Added cancel analyzer during processing

### v1.34.2
Don't open text file when analyzing. Also @MULTI fixes and other fixes.

### v1.33.5
Fixed numerous problems with fileOps

### v1.33.0
Added "Generate @PATH" from tree

### v1.32.0
Added icons to output view

### v1.31.3
Fixed version number bug in linux and mac

### v1.31.2
Added unicode character offsets to trees

### v1.30.16
Mac and Linux fixes

### v1.30.8
Security updates

### v1.30.7
Now uses the unicode version of the nlp-engine

### v1.30.0
Now handles utf8 files and characters (unicode)

### v1.21.4
Various minor issues fixed

### v1.20.7
Added stable file and directory deletes and copies

### v1.19.0
Added copy single analyzer or all analyzers to chosen folder

### v1.18.2
Added analyzer operation queue

### v1.17.1
Added sort & unique to text files

### v1.16.2
Major overhaul on updater

### v1.15.10
Reveals sequence number for an nlp file. This will eventually select the sequence item once Microsoft fully implements the reveal function for tree items.

### v1.14.3
Added delete logs to textview. Initialization messages now to LOGGING tab.

### v1.13.1
Simple search for function. This is a workable hack.

### v1.12.2
Added online browser lookup help where links work. This is to fix the fact that links don't work in the WebView inside VSCode.

### v1.11.1
Add clearing log folders for all analyzers for archiving analyzers

### v1.10.0
Copies settings.json file to the current work file for special NLP++ colorization

### v1.9.6
Added comment / uncomment lines

### v1.8.0
Added first version progress bar

### v1.7.8
Fixed autogenerate rule

### v1.7.7
Analyzer log files now have the extension .tree, added duplicate pass, update nlp-engine fix

### v1.6.1
Added updating VisualText files version separately allowing for independently updating

### v1.5.2
Now checks nlp-engine version and updates if newer exists. v1.5.2 improved lexer.

### v1.4.1
Allow for creating different type analyzers including basic and English

### v1.3.0
Changed all the pat files to nlp but still will process both extensions. Now downloads the latest version of nlp-engine at installation time, no longer included in the extension.

### v1.2.0
Fixed one line bug for the sequence file and allow for multiple pass selections for inserting.

### v1.1.2
Allows for dicttok, dicttokz, and cmltok variations of the tokenizer. Also delete and remame files also changes the log files directory name correctly in the textView.

### v1.1.1
Analyze a folder of texts

### v1.0.11
Fixed color highlights rule rewrite line

### v1.0.8
Updated NLP Engine with empty tmp folders

### v1.0.5
Added duplicate line for rule editor

### v1.0.4

The NLP engine executable and engine directory are now included in the NLP language extension for VSCode. The location of the engine is located in a subdirectory of the nlp extensions located in the extension directory located on the local computer. See documentation for VSCODE if you want to know the location of the directory which is different for different platforms.

### v0.9.29
Crash in reading the text files into the text view

### v0.9.28
Fixed sequence editor problems

### v0.9.27
Fixing paths for calling nlp.exe and missing npm package

## v0.9.23
- Changed fs.path to fs.fsPath

## v0.9.23
- Fixing highlight to rule fired logic

## v0.9.22
- Fixed mixed highlighting rule-fired bug

## v0.9.21
- Fixed delete directory bug

## v0.9.16
- Initial release with minor fixes
