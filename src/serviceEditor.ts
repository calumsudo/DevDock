import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Define service information
export interface ServiceInfo {
    label: string;
    url: string;
    iconPath: { light: string; dark: string };
    description?: string;
}

export class ServiceEditor {
    constructor(private context: vscode.ExtensionContext) {}

    // Get available icons from resources directory
    private getAvailableIcons(): { [key: string]: { light: string; dark: string } } {
        const iconsMap: { [key: string]: { light: string; dark: string } } = {};
        const resourcesPath = path.join(this.context.extensionPath, 'resources');
        
        try {
            const files = fs.readdirSync(resourcesPath);
            
            // Group light and dark icons
            files.forEach(file => {
                if (file.endsWith('-light.svg')) {
                    const baseName = file.replace('-light.svg', '');
                    const darkFile = `${baseName}-dark.svg`;
                    
                    if (files.includes(darkFile)) {
                        iconsMap[baseName] = {
                            light: `resources/${file}`,
                            dark: `resources/${darkFile}`
                        };
                    }
                }
            });
            
            return iconsMap;
        } catch (error) {
            console.error('Error reading resources directory:', error);
            return {};
        }
    }

    async addService(): Promise<ServiceInfo | undefined> {
        // Get label
        const label = await vscode.window.showInputBox({
            placeHolder: 'Service Name',
            prompt: 'Enter a name for the service',
            validateInput: value => value ? null : 'Name is required'
        });
        
        if (!label) {
            return undefined; // User cancelled
        }
        
        // Get URL
        const url = await vscode.window.showInputBox({
            placeHolder: 'http://localhost:8000',
            prompt: 'Enter the URL for the service',
            validateInput: value => value && value.startsWith('http') ? null : 'URL must be a valid HTTP or HTTPS address'
        });
        
        if (!url) {
            return undefined; // User cancelled
        }
        
        // Get description (optional)
        const description = await vscode.window.showInputBox({
            placeHolder: 'Optional description',
            prompt: 'Enter a description for the service (optional)'
        });
        
        // Get icon
        const iconsMap = this.getAvailableIcons();
        const iconKeys = Object.keys(iconsMap);
        
        if (iconKeys.length === 0) {
            vscode.window.showErrorMessage('No icons found in resources directory');
            return undefined;
        }
        
        const selectedIcon = await vscode.window.showQuickPick(iconKeys, {
            placeHolder: 'Select an icon for the service'
        });
        
        if (!selectedIcon) {
            return undefined; // User cancelled
        }
        
        // Create service info
        const serviceInfo: ServiceInfo = {
            label,
            url,
            iconPath: iconsMap[selectedIcon]
        };
        
        if (description) {
            serviceInfo.description = description;
        }
        
        return serviceInfo;
    }

    async editService(service: ServiceInfo): Promise<ServiceInfo | undefined> {
        // Pre-fill with existing values
        const label = await vscode.window.showInputBox({
            value: service.label,
            placeHolder: 'Service Name',
            prompt: 'Enter a name for the service',
            validateInput: value => value ? null : 'Name is required'
        });
        
        if (!label) {
            return undefined; // User cancelled
        }
        
        const url = await vscode.window.showInputBox({
            value: service.url,
            placeHolder: 'http://localhost:8000',
            prompt: 'Enter the URL for the service',
            validateInput: value => value && value.startsWith('http') ? null : 'URL must be a valid HTTP or HTTPS address'
        });
        
        if (!url) {
            return undefined; // User cancelled
        }
        
        const description = await vscode.window.showInputBox({
            value: service.description || '',
            placeHolder: 'Optional description',
            prompt: 'Enter a description for the service (optional)'
        });
        
        // For icon, we could keep the current one or select a new one
        const iconsMap = this.getAvailableIcons();
        const iconKeys = Object.keys(iconsMap);
        
        // Find the current icon key
        let currentIconKey = '';
        for (const [key, paths] of Object.entries(iconsMap)) {
            if (paths.light === service.iconPath.light && paths.dark === service.iconPath.dark) {
                currentIconKey = key;
                break;
            }
        }
        
        // Add an option to keep current icon
        const iconOptions = ['Keep current icon', ...iconKeys];
        
        const selectedIconOption = await vscode.window.showQuickPick(iconOptions, {
            placeHolder: 'Select an icon for the service'
        });
        
        if (!selectedIconOption) {
            return undefined; // User cancelled
        }
        
        // Create updated service info
        const updatedService: ServiceInfo = {
            label,
            url,
            iconPath: selectedIconOption === 'Keep current icon' ? service.iconPath : iconsMap[selectedIconOption]
        };
        
        if (description) {
            updatedService.description = description;
        }
        
        return updatedService;
    }
}