import * as vscode from 'vscode';
import * as path from 'path';
import { ServiceEditor, ServiceInfo } from './serviceEditor';

export class ServicesProvider implements vscode.TreeDataProvider<ServiceItem> {
    
    private _onDidChangeTreeData: vscode.EventEmitter<ServiceItem | undefined> = new vscode.EventEmitter<ServiceItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ServiceItem | undefined> = this._onDidChangeTreeData.event;
    
    // Services now come from configuration
    private services: ServiceInfo[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.loadServicesFromConfig();
    }

    // Load services from configuration
    private loadServicesFromConfig(): void {
        const config = vscode.workspace.getConfiguration('devdock');
        this.services = config.get<ServiceInfo[]>('services') || [];
    }

    // Save services to configuration
    private saveServicesConfig(services: ServiceInfo[]): Thenable<void> {
        const config = vscode.workspace.getConfiguration('devdock');
        return config.update('services', services, vscode.ConfigurationTarget.Global);
    }

    getTreeItem(element: ServiceItem): vscode.TreeItem {
        return element;
    }

    getChildren(): Thenable<ServiceItem[]> {
        // Refresh services from config
        this.loadServicesFromConfig();
        
        // Convert to ServiceItem objects
        return Promise.resolve(this.services.map(service => 
            new ServiceItem(
                service.label, 
                service.url,
                {
                    light: vscode.Uri.file(path.join(this.context.extensionPath, service.iconPath.light)),
                    dark: vscode.Uri.file(path.join(this.context.extensionPath, service.iconPath.dark))
                },
                service.description || '',
                service // Store the original service info for editing
            )
        ));
    }

    // Methods to manage services
    async addService(): Promise<void> {
        const serviceEditor = new ServiceEditor(this.context);
        
        const newService = await serviceEditor.addService();
        
        if (newService) {
            // Add to services array
            const updatedServices = [...this.services, newService];
            
            // Save to configuration
            await this.saveServicesConfig(updatedServices);
            
            // Refresh the view
            this.refresh();
        }
    }

    async editService(serviceItem: ServiceItem): Promise<void> {
        const serviceEditor = new ServiceEditor(this.context);
        const updatedService = await serviceEditor.editService(serviceItem.serviceInfo);
        
        if (updatedService) {
            // Replace in services array
            const index = this.services.findIndex(s => s.label === serviceItem.serviceInfo.label && s.url === serviceItem.serviceInfo.url);
            
            if (index !== -1) {
                const updatedServices = [...this.services];
                updatedServices[index] = updatedService;
                
                // Save to configuration
                await this.saveServicesConfig(updatedServices);
                
                // Refresh the view
                this.refresh();
            }
        }
    }

    async removeService(serviceItem: ServiceItem): Promise<void> {
        // Confirm deletion
        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to remove '${serviceItem.label}'?`,
            { modal: true },
            'Yes'
        );
        
        if (confirmation === 'Yes') {
            // Remove from services array
            const updatedServices = this.services.filter(s => 
                !(s.label === serviceItem.serviceInfo.label && s.url === serviceItem.serviceInfo.url)
            );
            
            // Save to configuration
            await this.saveServicesConfig(updatedServices);
            
            // Refresh the view
            this.refresh();
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
}

class ServiceItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly url: string,
        public readonly iconPath: { light: vscode.Uri; dark: vscode.Uri },
        public readonly description: string,
        public readonly serviceInfo: ServiceInfo
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${this.label}: ${this.url}${this.description ? ' - ' + this.description : ''}`;
        this.command = {
            command: 'devdock.openInWebView',
            title: 'Open in WebView',
            arguments: [this.label, this.url]
        };
    }

    contextValue = 'service';
}

// This class manages our webview panels
class ServiceWebViewManager {
    private webviewPanels = new Map<string, vscode.WebviewPanel>();
    
    constructor(private context: vscode.ExtensionContext) {}
    
    openServiceInWebView(title: string, url: string) {
        // Check if a panel for this service already exists
        const existingPanel = this.webviewPanels.get(url);
        if (existingPanel) {
            existingPanel.reveal();
            return;
        }
        
        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            'serviceWebview',
            title,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );
        
        // Set the panel HTML content - this creates an iframe to the service
        panel.webview.html = this.getWebviewContent(title, url);
        
        // Store the panel
        this.webviewPanels.set(url, panel);
        
        // Cleanup when the panel is closed
        panel.onDidDispose(() => {
            this.webviewPanels.delete(url);
        });
    }
    
    private getWebviewContent(title: string, url: string): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style>
                    body, html { margin: 0; padding: 0; height: 100%; }
                    iframe { width: 100%; height: 100%; border: none; }
                </style>
                <script>
                    // This function will create a new iframe if redirection is detected
                    function handleRedirects(iframe) {
                        try {
                            // Listen for messages from iframe (if same origin)
                            window.addEventListener('message', function(event) {
                                if (event.data && event.data.newUrl) {
                                    iframe.src = event.data.newUrl;
                                }
                            });
                        } catch (e) {
                            console.error('Error setting up redirect handler:', e);
                        }
                    }
                    
                    window.onload = function() {
                        const iframe = document.getElementById('serviceFrame');
                        handleRedirects(iframe);
                    };
                </script>
            </head>
            <body>
                <iframe id="serviceFrame" src="${url}" frameborder="0" allowfullscreen 
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
            </body>
            </html>
        `;
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Create our webview manager
    const webviewManager = new ServiceWebViewManager(context);
    
    // Register the services tree data provider
    const servicesProvider = new ServicesProvider(context);
    vscode.window.registerTreeDataProvider('devServices', servicesProvider);

    // Register command to open service in webview
    let openInWebViewCommand = vscode.commands.registerCommand('devdock.openInWebView', (title: string, url: string) => {
        webviewManager.openServiceInWebView(title, url);
    });

    // Register command to open service in external browser (as a fallback)
    let openServiceCommand = vscode.commands.registerCommand('devdock.openService', (serviceItem: ServiceItem) => {
        vscode.env.openExternal(vscode.Uri.parse(serviceItem.url));
    });

    // Register command to refresh services
    let refreshCommand = vscode.commands.registerCommand('devdock.refresh', () => {
        servicesProvider.refresh();
    });

    // Register service management commands
    let addServiceCommand = vscode.commands.registerCommand('devdock.addService', () => {
        servicesProvider.addService();
    });

    let editServiceCommand = vscode.commands.registerCommand('devdock.editService', (serviceItem: ServiceItem) => {
        servicesProvider.editService(serviceItem);
    });

    let removeServiceCommand = vscode.commands.registerCommand('devdock.removeService', (serviceItem: ServiceItem) => {
        servicesProvider.removeService(serviceItem);
    });

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('devdock.services')) {
                servicesProvider.refresh();
            }
        })
    );

    context.subscriptions.push(
        openInWebViewCommand, 
        openServiceCommand, 
        refreshCommand,
        addServiceCommand,
        editServiceCommand,
        removeServiceCommand
    );
}

export function deactivate() {}