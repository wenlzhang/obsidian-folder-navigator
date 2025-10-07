import { App } from "obsidian";

export enum FolderDisplayMode {
    DEFAULT = "default",
    RECENCY = "recency",
    FREQUENCY = "frequency",
}

export interface PluginSettings {
    maxResults: number;
    expandTargetFolder: boolean;
    debugMode: boolean;
    folderDisplayMode: FolderDisplayMode;
    recentFoldersToShow: number;
    frequentFoldersToShow: number;
    folderHistory: Record<
        string,
        {
            lastAccessed: number; // timestamp
            accessCount: number; // visit count
        }
    >;
    newFolderLocation: string; // Path where new folders should be created (empty string = root)
}

export const DEFAULT_SETTINGS: PluginSettings = {
    maxResults: 10,
    expandTargetFolder: true, // Enable by default for better navigation
    debugMode: false, // Disabled by default
    folderDisplayMode: FolderDisplayMode.DEFAULT,
    recentFoldersToShow: 5,
    frequentFoldersToShow: 5,
    folderHistory: {},
    newFolderLocation: "", // Empty string means root folder
};
