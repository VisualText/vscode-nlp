# Welcome to your VS Code Extension

## What's in the folder
* This folder contains all of the files necessary for your extension.
* `package.json` - this is the manifest file in which you declare your language support and define
the location of the grammar file that has been copied into your extension.
* `grammars/syntaxes/nlp.tmLanguage.json` - this is the Text mate grammar file that is used for tokenization.
* `language-configuration.json` - this is the language configuration, defining the tokens that are used for
comments and brackets.

## Clone with the grammar submodule
The TextMate grammars live in their own repository,
[VisualText/nlpplus-tmbundle](https://github.com/VisualText/nlpplus-tmbundle), so that
GitHub Linguist, Shiki, `bat` and other tools vendor exactly the files this extension ships.
It is wired in as the `grammars/` submodule, so clone with:

```
git clone --recurse-submodules https://github.com/VisualText/vscode-nlp.git
```

If you already cloned without it, run `git submodule update --init --recursive`. Without the
submodule there is no syntax highlighting. `npm run check-grammars` verifies the wiring, and
runs automatically before `npm run package` and `npm run publish`.

To change a grammar, edit it inside `grammars/`, commit and push there, then commit the
updated submodule pointer here.

## Get up and running straight away
* Make sure the language configuration settings in `language-configuration.json` are accurate.
* Press `F5` to open a new window with your extension loaded.
* Create a new file with a file name suffix matching your language.
* Verify that syntax highlighting works and that the language configuration settings are working.

## Make changes
* You can relaunch the extension from the debug toolbar after making changes to the files listed above.
* You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes.

## Add more language features
* To add features such as intellisense, hovers and validators check out the VS Code extenders documentation at
https://code.visualstudio.com/docs

## Install your extension
* To start using your extension with Visual Studio Code copy it into the `<user home>/.vscode/extensions` folder and restart Code.
* To share your extension with the world, read on https://code.visualstudio.com/docs about publishing an extension.
