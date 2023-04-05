/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {workspace, languages, ExtensionContext, TextDocument, window, FileSystemWatcher,} from 'vscode';
import {
    ClientCapabilities,
    DocumentSelector,
    InitializeParams,
    LanguageClient,
    LanguageClientOptions,
    ServerCapabilities,
    ServerOptions,
    StaticFeature, StreamInfo
} from 'vscode-languageclient/node';
import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as child_process from "child_process";

const LANGUAGE_ID = 'gop';
export let savedContext: ExtensionContext;
let client: LanguageClient;

export function activate(context: ExtensionContext) {
    savedContext = context;

    createClient();

    checkAllDocuments();

    // See: https://github.com/redhat-developer/vscode-yaml
    // See: https://github.com/davidhewitt/shebang-language-associator/blob/master/src/extension.ts

    let disposable = workspace.onDidOpenTextDocument(checkDocument);
    savedContext.subscriptions.push(disposable);

    disposable = workspace.onDidSaveTextDocument(checkDocument);
    savedContext.subscriptions.push(disposable);
}

export function deactivate() {
    return Promise.all([
        client?.stop(),
    ])
}

// mac目录赋予可执行权限
function changeExMod() {
    try {
        if (process.platform === "darwin" || process.platform === "linux") {
            var vscodeRunStr: string = path.resolve(savedContext.extensionPath, "server");
            // 赋予可执行权限
            let cmdExeStr = "chmod -R +x " + vscodeRunStr;
            child_process.execSync(cmdExeStr);
        }
    } catch (e) {
        //捕获异常
        console.log("exception");
        window.showInformationMessage("chmod error");
    }
}

function checkAllDocuments() {
    for (const textDocument of workspace.textDocuments) {
        checkDocument(textDocument);
    }
}

function checkDocument(textDocument: TextDocument) {
    // Any YAML file that contains a line starting with "tosca_definitions_version: "
    if (textDocument.fileName.match(/.gop$/)) {
        languages.setTextDocumentLanguage(textDocument, LANGUAGE_ID);
    }
}

async function createClient() {
    changeExMod();
    // 定义所有的监控文件后缀的关联
    let filesWatchers: FileSystemWatcher[] = new Array<FileSystemWatcher>();
    filesWatchers.push(workspace.createFileSystemWatcher("**/*.gop"));

    // 获取其他文件关联为gop的配置
    let fileAssociationsConfig = workspace.getConfiguration("files.associations", null);
    if (fileAssociationsConfig !== undefined) {
        for (const key of Object.keys(fileAssociationsConfig)) {
            if (fileAssociationsConfig.hasOwnProperty(key)) {
                let strValue = <string><any>fileAssociationsConfig[key];
                if (strValue === "gop") {
                    // 如果映射为gop文件
                    filesWatchers.push(workspace.createFileSystemWatcher("**/" + key));
                }
            }
        }
    }
    let clientOptions: LanguageClientOptions = {
        documentSelector: [{scheme: 'file', language: LANGUAGE_ID}],
        synchronize: {
            configurationSection: ["[gop]", "files.associations"],
            fileEvents: filesWatchers,
        },

    };
    let DEBUG_MODE = process.env['GOP_LSP_DEBUG'] === "true";
    if (DEBUG_MODE) {
        const connectionInfo = {
            host: "localhost",
            port: 7778
        };
        let serverOptions: ServerOptions;
        serverOptions = () => {
            // Connect to language server via socket
            let socket = net.connect(connectionInfo);
            let result: StreamInfo = {
                writer: socket,
                reader: socket as NodeJS.ReadableStream
            };

            socket.on("close", () => {
                window.showInformationMessage("luahelper connect close");
                console.log("client connect error!");
            });
            return Promise.resolve(result);
        };

        client = new LanguageClient(LANGUAGE_ID, 'GoPlus Language Server', serverOptions, clientOptions);

        savedContext.subscriptions.push(client.start());
        await client.onReady();
    }else{
        let cp: string = "";
        let platform: string = os.platform();
        switch (platform) {
            case "win32":
                cp = path.resolve(savedContext.extensionPath, "server", "goplsp.exe");
                break;
            case "linux":
                cp = path.resolve(savedContext.extensionPath, "server", "linuxgoplsp");
                break;
            case "darwin":
                cp = path.resolve(savedContext.extensionPath, "server", "macgoplsp");
                break;
        }

        if (cp === "") {
            return;
        }

        let serverOptions: ServerOptions;
        let logSetStr = "-logflag=1";

        serverOptions = {
            command: cp,
            args: ["-mode=1", logSetStr]
        };
        client = new LanguageClient(LANGUAGE_ID, 'GoPlus Language Server', serverOptions, clientOptions);
        savedContext.subscriptions.push(client.start());
        await client.onReady();
    }
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

    fillClientCapabilities(_capabilities: ClientCapabilities): void {
    }

    initialize(_capabilities: ServerCapabilities<any>, _documentSelector: DocumentSelector): void {
    }

    dispose(): void {
    }
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