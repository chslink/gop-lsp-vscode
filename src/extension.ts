/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { workspace, languages, ExtensionContext, TextDocument, } from 'vscode';
import { ClientCapabilities, DocumentSelector, InitializeParams, LanguageClient, LanguageClientOptions, ServerCapabilities, ServerOptions, StaticFeature } from 'vscode-languageclient/node';

export function activate(context: ExtensionContext) {
	createClient();

	checkAllDocuments();

	// See: https://github.com/redhat-developer/vscode-yaml
	// See: https://github.com/davidhewitt/shebang-language-associator/blob/master/src/extension.ts

	let disposable = workspace.onDidOpenTextDocument(checkDocument);
	context.subscriptions.push(disposable);

	disposable = workspace.onDidSaveTextDocument(checkDocument);
	context.subscriptions.push(disposable);
}

export function deactivate() {
	return Promise.all([
		client?.stop(),
	])
}


function checkAllDocuments() {
	for (const textDocument of workspace.textDocuments) {
		checkDocument(textDocument);
	}
}

function checkDocument(textDocument: TextDocument) {
	// Any YAML file that contains a line starting with "tosca_definitions_version: "
	if (textDocument.fileName.match(/.gop$/)) {
		languages.setTextDocumentLanguage(textDocument, 'gop');
	}
}


let client: LanguageClient;

function createClient() {
	let command = '/data/work/gop-lsp/gop-lsp'

	let serverOptions: ServerOptions = {
		run: {
			command: command,
			args: ['-mode=1', '-logflag=1']
		},
		debug: {
			command: command,
			args: ['-mode=1', '-logflag=1']
		}
	};

	let clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'gop' }]
	};

	client = new LanguageClient(
		'gop',
		'GoPlus Language Server',
		serverOptions,
		clientOptions
	);

	if (startedInDebugMode()) {
		client.registerFeature(new TraceFeature('verbose'));
	}

	client.start();

	client.onReady().then(initialize);
}

function initialize() {
	//client.sendNotification('$/setTrace', {value: 'verbose'})
}

class TraceFeature implements StaticFeature {
	private _trace: 'off' | 'messages' | 'verbose';

	constructor(trace: 'off' | 'messages' | 'verbose') {
		this._trace = trace;
	}

	fillInitializeParams(params: InitializeParams): void {
		params.trace = this._trace;
	}

	fillClientCapabilities(_capabilities: ClientCapabilities): void { }
	initialize(_capabilities: ServerCapabilities<any>, _documentSelector: DocumentSelector): void { }
	dispose(): void { }
}

// See: https://github.com/microsoft/vscode-languageserver-node/blob/f2902aacfa2fce6f5cb9448d6dffeef2ace3e570/client/src/node/main.ts#L240

const debugStartWith: string[] = ['--debug=', '--debug-brk=', '--inspect=', '--inspect-brk='];
const debugEquals: string[] = ['--debug', '--debug-brk', '--inspect', '--inspect-brk'];

function startedInDebugMode(): boolean {
	let args: string[] = (process as any).execArgv;
	if (args) {
		return args.some((arg) => {
			return debugStartWith.some(value => arg.startsWith(value)) || debugEquals.some(value => arg === value);
		});
	}
	return false;
}