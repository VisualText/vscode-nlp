# NLP++ Language Extension README

This is a language extension for VSCode for NLP++ to recreate the functionality of VisualText which lived Microsoft Windows only.

## Features

The NLP++ language extension allows for the fast development of NLP++ analyzers allowing users to:

* Quickly generate and edit NLP++ code
* Display the syntax tree in insightful ways
* Highlight text that has matched rules in each pass
* Display the knowledge base at strategic places in the analayzer sequence
* Easily edit and modify the pass sequence and texts to be analyze
* Display syntax errors to NLP++

![NLP++ Language Extension Screenshot](resources/VSCodeNLP.png)

## Requirements

The NLP++ Language extension depends on the NLP-ENGINE on the [VisualText github repository.](https://gihub.com/VisualText/nlp-engine) The executable nlp.exe

## Extension Settings

There are several json files that hold configuration and states for VisualText for VSCode:

* state.json - in the analyzer folder holding information such as the path to nlp.exe and the last analyzer selected
* state.json - in each analyzer directory holding the last text processed

### General state.json

This json file is located in the .vscode directory in a folder that holds analyzers for that workspace.

    {
        "visualText": [
            {
                "name": "Analyzer",
                "type": "state",
                "engineDir": "/YOUR-PATH-HERE/nlp-engine/",
                "currentAnalyzer": "/YOUR-PATH-HERE/nlp-engine/analyzers/DOJ-Quick"
            }
        ]
    }

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
    
## Development

You must have installed the NLP-ENGINE in order to use this VSCode extension. You can find how to install this at: [https://github.com/VisualText/vscode-nlp](https://github.com/VisualText/vscode-nlp).

Follow these instructions to install the development code for VSCode extension:

    cd /Some/Dev/Folder/
    git clone https://github.com/VisualText/vscode-nlp.git
    cd vscode-nlp
    npm install

At which point you can open the `vscode-nlp` folder within VS Code.

Next start the background build process by running the following command within a terminal session:

    npm run watch
    
At which point you can edit the sources and launch debug sessions via F5 and included launch configurations.

## Known Issues

There are many details in the windows version of VisualText that are yet to be implemented in the VSCode version.

## Release Notes

This extension has not yet been pushed to the official microsoft extensions repository. Once the beta version has been thoroughly tested, it will be submitted.

### Beta

0.1
