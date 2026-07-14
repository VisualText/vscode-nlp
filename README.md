# NLP++ Language Extension

[![NLP++ Textbook](https://raw.githubusercontent.com/VisualText/vscode-nlp/master/resources/TextbookLaunch01_LinkedIn%20Banner.png)](https://book.visualtext.org)

## First Textbook on the NLP++ Programming Langauge

The first textbook on NLP++ is now available world-wide by [BPB Online](https://book.visualtext.org). NLP++ can replace LLMs when used in agentic flows. The code must be written by a human like any other programming language and this book will facilitate this process. NLP++ is no a statistical system that needs training. It relies on the ingenuity of the programmer to create a program that can parse text and extract information in a deterministic way.

![Natural Language Understanding Global Initiative](resources/NLUGlobLogoBanner.png)

In November of 2023, the [Natural Language Understanding Global Initiative](http://nluglob.org) was born to help coordinate the growing efforts of [students, faculty, and researchers](https://nluglob.org) in the open-source natural language understanding community.

## What's New in Version 3

Version 3 is the release line in which NLP++ analyzers became **compilable to native code — with one click, in the cloud, and shippable without source**. NLP++ is *glass-box*, **deterministic** NLP: the same input always produces the same output from rules you can read, which makes it a fit for critical-path systems where statistical models can't be trusted. Version 3 makes that engine faster and far easier to deliver.

### Compile analyzers to native libraries — one click, no C++ needed
- **Compile Analyzer and KB** turns an NLP++ analyzer and its knowledge base into a native shared library (`.dll` / `.so` / `.dylib`). Compilation was always technically possible but effectively expert-only; the extension now makes it a single command.
- **Granular targets** so you only rebuild what changed:
  - **Compile Analyzer and KB** — the whole analyzer (rules + KB) into one library.
  - **Compile KB** — just the knowledge base (matching **Compiled KB** run mode).
  - **Compile Analyzer Only** — just the rules, reusing an already-compiled KB.
- **Run modes** you can toggle from the status bar: **Interpreted**, **Compiled** (analyzer + KB), **Compiled KB**, and **Compiled Analyzer**. Compiled mode runs the analyzer body from native libraries on **Windows, Linux, and macOS** (early v3 ran compiled rules on Windows only).

### Two big advantages
- **Faster execution** — native code instead of interpreting rules at run time.
- **Protection of NLP++ source** — deliver analyzers to customers as compiled libraries, without shipping the `.nlp` rule source.

### Cloud compile — no local toolchain required
- Set `compile.mode` to **cloud** and the extension submits your analyzer to a **cloud-compile service** that builds the native library for Windows, Linux, and macOS on hosted runners. It verifies the engine release exists, shows live progress, and downloads the finished library — no local C++ compiler, CMake, or Visual Studio needed. Local CMake-based compilation is also supported (`compile.mode = local`).

### Deploy a stand-alone compiled analyzer
- **Deploy Compiled Analyzer to Folder** exports a runnable, stripped-down copy of a compiled analyzer into a folder you choose: the native library staged as the engine's `bin/` entry points, the lazy `*-full` dictionaries/KBs, and any `spec/*.py` python-pass scripts — while leaving the `.nlp` rule source out. Ideal for delivering a compiled analyzer that exposes only the data the runtime needs. *(Run the deployed folder with an installed NLP engine of the same architecture as the compiled library.)*

### Large lexicons: lazy dictionaries & knowledge bases
- `*-full.dict` / `*-full.kbb` files **load lazily** — the engine binary-searches the sorted file on disk one word at a time instead of loading the whole lexicon into memory, dramatically cutting memory and startup cost. Multiple lazy files can be open at once, and the analyzer log reports each one.
- Lazy files are **never compiled into the library** — they stay as data files and are stream-searched at run time, so they behave identically in interpreted and compiled analyzers.

### Python passes (interpreted *and* compiled)
- A `python` pass can sit anywhere in the analyzer sequence — including **before the tokenizer** (for example, to build a knowledge base from a JSON data file before analysis). As of engine 3.7.10 these passes are emitted into the compiled analyzer and run from the native library, not just when interpreted.

### In-editor markdown help
- Function, variable, and index help render as **markdown previews inside the editor** (replacing the old browser/HTML help).

## Version 2 milestone

On December 29, 2022, Version 2 introduced the ability to build and use the analyzer view together with the updated NLP-ENGINE.

## Tutorial Videos

Many of you have been asking for tutorial videos on NLP++ and here is the first set. More coming soon...
1. NLP++ tutorial videos: http://tutorials.visualtext.org
1. Analyzers used in the videos: https://github.com/VisualText/nlp-tutorials
1. VisualText tutorial videos: http://vttutorials.visualtext.org

## NLP Discourse Forum

Because of NLP++ being 100% open-source, [Discourse](https://www.discourse.org/) has donated a free NLP Forum for NLP++: [https://nlp.discourse.group](https://nlp.discourse.group). There, in the community, users can ask questions and discuss NLP++ and VisualText.

## Only Computer Language Dedicated to Text and Natural Language Processing
NLP++ is the only computer language in the world exclusively dedicated to natural language processing. It allows for creating digital human readers that use linguistic and world knowledge to parse, tag, interpret, and extract information from text.

## NLP++ and VisualText Now Unicode

The NLP-Engine for NLP++ now works with Unicode (UTF8 via the ICU C++ Package) including the ability to work with emojis.

![NLP++ Now works with Unicode in the form of UTF8](resources/UnicodeExample.gif)

## Quick Video Guides
Find [quick video guides](http://tutorials.visualtext.org/) on how to install and use VisualText including a "hello world" video as well as an in-depth tour of VisualText.

## Introduction

This is a VSCode Language Extension for NLP++ that recreates the functionality of [VisualText](http://visualtext.org) which has run on Microsoft Windows for the last two decades. NLP++ is a open source computer language designed specifically for text and natural language processing. This extension runs on Linux, Windows, and MacOS.

The language extension and the required NLP-ENGINE run on Linux, Windows, and MacOS.

## Features

The VSCode NLP++ Language Extension allows for the fast development of NLP++ analyzers allowing users to:

* Quickly generate and edit NLP++ code
* Display the syntax tree in insightful ways
* Highlight text that has matched rules in each pass
* Display the knowledge base at strategic places in the analyzer sequence
* Easily edit and modify the pass sequence and texts to be analyzed
* Display syntax errors to NLP++
* Compile analyzers and KBs to C++ libraries for faster execution and source-code protection in customer deployments
* Auto generate rules
* Extensive snippets
* Help lookup

## NLP++ Example Analyzers

Example analyzers can be found in the "analyzers" folder in the NLP-ENGINE folder.

![NLP++ Language Extension opening example analyzers including the full English parser](resources/OpeningAnalyzersFolder.gif)

## Requirements

In order to use the VSCode NLP++ Language Extension, the NLP-ENGINE which is in the form of an executable and directory need to be present. Version one now includes this as part of the NLP language extension.

## NLP Engine Overview

The NLP-ENGINE now comes with the NLP++ Language extension but is available separately from the [VisualText github repository](https://github.com/VisualText/nlp-engine). The engine can run as a stand alone executable outside of the language extension.

### Compile build modes

The extension supports two ways to turn a `-COMPILE`d analyzer into the shared libraries that `-COMPILED` mode loads (`bin/run.<ext>` + `bin/kb.<ext>`):

- **`compile.mode = "local"`** (default): the extension drives CMake locally against the engine's compile-libs. Requires a working C++ toolchain on the user's machine (Visual Studio Build Tools on Windows, build-essential on Linux, Xcode CLI on macOS) plus CMake ≥ 3.16.
- **`compile.mode = "cloud"`**: the extension tarballs the generated C++ and uploads it to the [nlp-compile-service](https://github.com/VisualText/nlp-compile-service) Cloudflare Worker. The worker routes the build to a GitHub Actions runner (Linux / Windows / macOS as appropriate), and the extension downloads the resulting library and stages it into `<analyzer>/bin/`. No local C++ toolchain needed; requires `compile.dispatcherUrl` to be set.

### Compile Asset Requirements (local mode only)

For `compile.mode = "local"`, the `VisualText/nlp-engine` latest release must include the additional asset `nlpengine-compile-libs.zip`. It extracts under the extension's `nlp-engine` folder and includes:

- `include/` (engine headers)
- `lib/` (engine static libraries: `prim`, `kbm`, `consh`, `words`, `lite`, plus ICU)

The updater in `vscode-nlp` checks for and downloads this asset on startup so the local compile path is ready out of the box.

Cloud mode doesn't need any of this — the compile-libs live on the runner side.

### Types of Analyzers Commonly Written Using NLP++

There are many types of analyzers that are written by NLP++ programmers including:

* Tagging of text
* Extract emails, dates, addresses, etc from unstructured text
* Entity Extraction
* Full NLP Parsing
* Sentiment analysis
* OCR Cleanup
* Extraction of data from messy text
* Autogenerate snippets from documentation

### Analyzer state.json

This file will automatically get generated when a new analyzer is created in VisualText VSCode. It is located in the .vscode directory under the folder for an individual analyzer.

    {
        "visualText": [
            {
                "name": "Analyzer",
                "type": "state",
                "currentTextFile": "/YOUR-PATH-HERE/nlp-engine/analyzers/corporate/input/Dev/Sold.txt",
                "currentPassFile": "/YOUR-PATH-HERE/nlp-engine/analyzers/corporate/spec/lookup.pat"
            }
        ]
    }

## Known Issues

Click [here](https://github.com/VisualText/vscode-nlp/issues) for known issues.

## Release Notes

For the complete list of changes and release notes, click [here](https://marketplace.visualstudio.com/items/dehilster.nlp/changelog).

### 3.1.21
Bumps the bundled engine to v3.1.44 (and updates the auto-updater to follow). The new engine enables compiled-RUN dispatch on Linux and macOS — `compile.mode = "compiled"` now runs the full analyzer body from `bin/run.<ext>` on every platform, not just Windows. Companion to the VSCODE-NLP-572 staging fix in 3.1.20.

### 3.1.20
Linux and macOS: the extension's "Compile Analyzer and KB to C++ Library" command now stages the cloud-built `.so` / `.dylib` into `<analyzer>/bin/run.<ext>` + `bin/kb.<ext>` so the engine's `-COMPILED` load path actually finds it. Previously the staging step was Windows-only with a stale "engine -COMPILED only loads a runtime DLL on Windows" comment that was no longer true.

### 3.1.10
Renamed the existing analyzer compile command to "Compile Analyzer and KB to C++ Library". "Compile KB to C++ Library" now invokes `nlp.exe -COMPILEKB` and emits `kb.dll`. Added a "Compiled KB" run mode that runs the analyzer interpreted against the compiled KB library. The run-mode status bar now cycles Interpreted -> Compiled -> Compiled KB. (Engine 3.1.44+ extends Compiled to also run the analyzer body natively on Linux/macOS — see 3.1.21 notes.)

### 3.0.0
Added support for compiling analyzers and the knowledge base (KB). Benefits include faster execution and protection of native NLP++ source code when analyzers are distributed to customers without access to the NLP++ source.

### 2.49.6
Now has different colorization for light and dark themes.

### 2.48.5
Opens the local html files in the browser instead of online.

### 2.47.0
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

### 2.24.6
Can now display fired rules from dictionaries.

# Telemetry

This extension can send **anonymous usage data** to help prioritize features and catch errors in the field. It records only counts and metadata — for example, that a document was formatted, which analyzer run mode was used, or that a handled error occurred. It **never** sends file contents, analyzer/KB/dictionary source, file names, paths, or any text being analyzed.

Telemetry respects two independent opt-outs, and sends nothing if either is off:

- VS Code's global `telemetry.telemetryLevel` setting (`off` disables all extension telemetry), and
- the extension's own `nlp.telemetry.enable` setting.

# Development

## VSCode Language Extension

Follow these instructions to install the development code for VSCode extension:

    git clone https://github.com/VisualText/vscode-nlp.git
    cd vscode-nlp
    npm install
    npm run watch
    
At which point you can edit the sources and launch debug sessions via F5 and included launch configurations.

## NLP Engine

The NLP Engine which is written in C++ is also open source and can be downloaded in development mode. You can find how to download and develop the NLP Engine code at: [https://github.com/VisualText/nlp-engine](https://github.com/VisualText/nlp-engine)

# License

[MIT](https://github.com/VisualText/vscode-nlp/blob/master/LICENSE)
