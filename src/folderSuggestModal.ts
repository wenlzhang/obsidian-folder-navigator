import {
    App,
    FuzzySuggestModal,
    TFolder,
    WorkspaceLeaf,
    View,
    FuzzyMatch,
} from "obsidian";
import type FolderNavigatorPlugin from "./main";
import { FolderDisplayMode } from "./settings";

// Helper function for conditional logging based on plugin settings
function log(
    message: string,
    plugin: FolderNavigatorPlugin,
    ...args: any[]
): void {
    if (plugin.settings.debugMode) {
        console.log(message, ...args);
    }
}

// Helper function for error logging (always show errors)
function logError(message: string, ...args: any[]): void {
    console.error(message, ...args);
}

interface FileExplorerView extends View {
    fileItems: Record<string, any>;
    expandFolder?: (folder: TFolder) => void; // Optional: may not exist in all versions
}

interface FileExplorerInstance {
    view: FileExplorerView;
    revealInFolder: (file: any) => void;
}

interface InternalPlugins {
    plugins: {
        "file-explorer": {
            instance: FileExplorerInstance;
        };
    };
}

interface ExtendedApp extends App {
    internalPlugins: InternalPlugins;
}

interface FolderWithScore {
    folder: TFolder;
    score: number;
    match: FuzzyMatch<TFolder>;
}

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
    folders: TFolder[];
    plugin: FolderNavigatorPlugin;
    sortedFolders: TFolder[] = [];

    constructor(app: App, plugin: FolderNavigatorPlugin) {
        super(app);
        this.plugin = plugin;
        this.setPlaceholder("Type folder name...");
        this.folders = this.getAllFolders();
        this.sortedFolders = this.getSortedFolders();

        // Use the max results from settings
        this.limit = this.plugin.settings.maxResults;
    }

    private getAllFolders(): TFolder[] {
        return this.app.vault.getAllFolders();
    }

    /**
     * Sort folders based on the selected display mode in settings
     */
    private getSortedFolders(): TFolder[] {
        const allFolders = this.getAllFolders();
        const displayMode = this.plugin.settings.folderDisplayMode;

        log(`Sorting folders using display mode: ${displayMode}`, this.plugin);

        // Default sorting (alphabetical by path)
        if (displayMode === FolderDisplayMode.DEFAULT) {
            return allFolders;
        }

        // Get folder history from settings
        const folderHistory = this.plugin.settings.folderHistory;

        if (displayMode === FolderDisplayMode.RECENCY) {
            // Create a copy of all folders to sort
            const recentLimit = this.plugin.settings.recentFoldersToShow;

            // Find folders with history and sort by last accessed timestamp (descending)
            const foldersWithHistory = allFolders.filter(
                (f) => folderHistory[f.path],
            );
            const recentFolders = foldersWithHistory
                .sort((a, b) => {
                    const timeA = folderHistory[a.path]?.lastAccessed || 0;
                    const timeB = folderHistory[b.path]?.lastAccessed || 0;
                    return timeB - timeA; // Descending order (newest first)
                })
                .slice(0, recentLimit);

            // Get the remaining folders (those without history or beyond the limit)
            const recentFolderPaths = new Set(recentFolders.map((f) => f.path));
            const remainingFolders = allFolders.filter(
                (f) => !recentFolderPaths.has(f.path),
            );

            log(
                `Found ${recentFolders.length} recent folders to display`,
                this.plugin,
            );

            // Only add separator if we have recent folders to show
            if (recentFolders.length > 0) {
                // Create a separator "folder" (not a real folder)
                const separator = {} as TFolder;
                (separator as any)._isSeparator = true;
                (separator as any)._separatorText =
                    "— Recently visited folders —";

                // Create another separator for the remaining folders
                const remainingSeparator = {} as TFolder;
                (remainingSeparator as any)._isSeparator = true;
                (remainingSeparator as any)._separatorText = "— All folders —";

                // Combine recent folders with remaining folders with separators
                return [
                    separator,
                    ...recentFolders,
                    remainingSeparator,
                    ...remainingFolders,
                ];
            }

            // If no recent folders, just return all folders
            return allFolders;
        }

        if (displayMode === FolderDisplayMode.FREQUENCY) {
            // Create a copy of all folders to sort
            const frequentLimit = this.plugin.settings.frequentFoldersToShow;

            // Find folders with history and sort by access count (descending)
            const foldersWithHistory = allFolders.filter(
                (f) => folderHistory[f.path],
            );
            const frequentFolders = foldersWithHistory
                .sort((a, b) => {
                    const countA = folderHistory[a.path]?.accessCount || 0;
                    const countB = folderHistory[b.path]?.accessCount || 0;
                    return countB - countA; // Descending order (most frequent first)
                })
                .slice(0, frequentLimit);

            // Get the remaining folders (those without history or beyond the limit)
            const frequentFolderPaths = new Set(
                frequentFolders.map((f) => f.path),
            );
            const remainingFolders = allFolders.filter(
                (f) => !frequentFolderPaths.has(f.path),
            );

            log(
                `Found ${frequentFolders.length} frequent folders to display`,
                this.plugin,
            );

            // Only add separator if we have frequent folders to show
            if (frequentFolders.length > 0) {
                // Create a separator "folder" (not a real folder)
                const separator = {} as TFolder;
                (separator as any)._isSeparator = true;
                (separator as any)._separatorText =
                    "— Frequently visited folders —";

                // Create another separator for the remaining folders
                const remainingSeparator = {} as TFolder;
                (remainingSeparator as any)._isSeparator = true;
                (remainingSeparator as any)._separatorText = "— All folders —";

                // Combine frequent folders with remaining folders with separators
                return [
                    separator,
                    ...frequentFolders,
                    remainingSeparator,
                    ...remainingFolders,
                ];
            }

            // If no frequent folders, just return all folders
            return allFolders;
        }

        // Fallback to default sorting
        return allFolders;
    }

    /**
     * Update folder access history when a folder is selected
     */
    private updateFolderHistory(folder: TFolder): void {
        // Get current history or create new entry
        const folderPath = folder.path;
        const history = this.plugin.settings.folderHistory[folderPath] || {
            lastAccessed: 0,
            accessCount: 0,
        };

        // Update history data
        history.lastAccessed = Date.now();
        history.accessCount += 1;

        // Save back to settings
        this.plugin.settings.folderHistory[folderPath] = history;

        // Save settings
        this.plugin.saveSettings();

        log(
            `Updated folder history for "${folderPath}": ${JSON.stringify(history)}`,
            this.plugin,
        );
    }

    /**
     * Custom search implementation with improved fuzzy matching
     * Supports out-of-order keyword matching and better scoring
     */
    getSuggestions(query: string): FuzzyMatch<TFolder>[] {
        // If no query, return all items (or recent/frequent items based on settings)
        if (!query || query.trim().length === 0) {
            return this.sortedFolders.map((folder) => ({
                item: folder,
                match: { score: 0, matches: [] },
            }));
        }

        const normalizedQuery = query.toLowerCase().trim();

        // Split query into keywords (space-separated)
        const keywords = normalizedQuery
            .split(/\s+/)
            .filter((k) => k.length > 0);

        log(
            `Search query: "${query}", keywords: [${keywords.join(", ")}]`,
            this.plugin,
        );

        // Score each folder
        const foldersWithScore: FolderWithScore[] = [];

        for (const folder of this.sortedFolders) {
            // Skip separators
            if ((folder as any)._isSeparator) {
                foldersWithScore.push({
                    folder,
                    score: -1,
                    match: { item: folder, match: { score: 0, matches: [] } },
                });
                continue;
            }

            const folderPath = folder.path.toLowerCase();
            const folderName = folder.name.toLowerCase();
            const originalPath = folder.path; // Keep original case for match positions

            // Check if all keywords match (in any order)
            let allKeywordsMatch = true;
            let totalScore = 0;
            const matchPositions: Array<[number, number]> = [];

            for (const keyword of keywords) {
                const pathIndex = folderPath.indexOf(keyword);
                const nameIndex = folderName.indexOf(keyword);

                if (pathIndex === -1) {
                    // Keyword doesn't match this folder at all
                    allKeywordsMatch = false;
                    break;
                }

                // Store match positions for highlighting (using original path positions)
                // We need to find the keyword in the original case-sensitive path
                const originalPathLower = originalPath.toLowerCase();
                const matchIndex = originalPathLower.indexOf(keyword);

                // Record character positions for this keyword
                for (let i = 0; i < keyword.length; i++) {
                    matchPositions.push([matchIndex + i, matchIndex + i]);
                }

                // Calculate score for this keyword
                let keywordScore = 0;

                // Bonus for matching in folder name (not just path)
                if (nameIndex !== -1) {
                    keywordScore += 100;

                    // Extra bonus for exact name match
                    if (folderName === keyword) {
                        keywordScore += 200;
                    }
                    // Bonus for name starting with keyword
                    else if (nameIndex === 0) {
                        keywordScore += 50;
                    }
                } else {
                    // Match is in parent path, lower score
                    keywordScore += 10;
                }

                // Bonus for match position (earlier is better)
                keywordScore += Math.max(0, 50 - pathIndex);

                totalScore += keywordScore;
            }

            if (allKeywordsMatch) {
                // Additional scoring adjustments

                // Penalize deeper nested folders
                const depth = folder.path.split("/").length;
                totalScore -= depth * 5;

                // Bonus for shorter paths (more specific)
                totalScore += Math.max(0, 100 - folder.path.length);

                foldersWithScore.push({
                    folder,
                    score: totalScore,
                    match: {
                        item: folder,
                        match: {
                            score: totalScore,
                            matches: matchPositions,
                        },
                    },
                });
            }
        }

        // Sort by score (descending)
        foldersWithScore.sort((a, b) => {
            // Keep separators at their original positions
            if (
                (a.folder as any)._isSeparator ||
                (b.folder as any)._isSeparator
            ) {
                return 0;
            }
            return b.score - a.score;
        });

        // Apply parent folder deduplication for Issue #4
        // When a parent folder matches, deprioritize its immediate children
        const results: FuzzyMatch<TFolder>[] = [];
        const parentPaths = new Set<string>();

        for (const item of foldersWithScore) {
            // Always include separators
            if ((item.folder as any)._isSeparator) {
                results.push(item.match);
                continue;
            }

            const folderPath = item.folder.path;

            // Check if this folder's parent is already in results
            let shouldInclude = true;
            let isChildOfMatch = false;

            for (const parentPath of parentPaths) {
                // Check if current folder is a child of an already matched parent
                if (folderPath.startsWith(parentPath + "/")) {
                    isChildOfMatch = true;

                    // Check if this child has additional matches beyond the parent
                    const parentKeywordMatches = keywords.filter((k) =>
                        parentPath.toLowerCase().includes(k),
                    );
                    const childKeywordMatches = keywords.filter((k) =>
                        folderPath.toLowerCase().includes(k),
                    );

                    // If child doesn't have more keyword matches than parent, deprioritize it
                    if (
                        childKeywordMatches.length <=
                        parentKeywordMatches.length
                    ) {
                        // Lower the score significantly to push it down
                        item.score = item.score * 0.1;
                        item.match.match.score = item.score;
                    }
                    break;
                }
            }

            results.push(item.match);

            // Add this folder to parent paths for future checks
            if (!isChildOfMatch) {
                parentPaths.add(folderPath);
            }
        }

        // Re-sort after deduplication adjustments
        const finalResults = results.sort((a, b) => {
            // Keep separators at original positions
            if ((a.item as any)._isSeparator || (b.item as any)._isSeparator) {
                return 0;
            }
            return (b.match?.score || 0) - (a.match?.score || 0);
        });

        // Limit results
        const limitedResults = finalResults.slice(0, this.limit);

        log(`Found ${limitedResults.length} matching folders`, this.plugin);

        return limitedResults;
    }

    getItems(): TFolder[] {
        return this.sortedFolders;
    }

    getItemText(folder: TFolder): string {
        // For separator folders (which will have a special property), return the separator text
        if ((folder as any)._isSeparator) {
            return (folder as any)._separatorText;
        }
        return folder.path;
    }

    /**
     * Get all parent folders of a given folder in order from root to leaf
     */
    private getParentFolderChain(folder: TFolder): TFolder[] {
        const parentChain: TFolder[] = [];
        let currentFolder: TFolder | null = folder.parent;

        while (currentFolder) {
            parentChain.unshift(currentFolder); // Add at beginning to get root->leaf order
            currentFolder = currentFolder.parent;
        }

        return parentChain;
    }

    /**
     * Get the file explorer instance from Obsidian's internal APIs
     */
    private getFileExplorer(): FileExplorerInstance | null {
        try {
            const app = this.app as ExtendedApp;

            if (!app.internalPlugins?.plugins["file-explorer"]?.instance) {
                logError("Could not find file explorer plugin instance");
                return null;
            }

            const fileExplorer =
                app.internalPlugins.plugins["file-explorer"].instance;

            if (typeof fileExplorer.revealInFolder !== "function") {
                logError(
                    "revealInFolder method not found on file explorer instance",
                );
                return null;
            }

            // Log available methods for debugging
            if (this.plugin.settings.debugMode) {
                log("File explorer instance methods:", this.plugin);
                const methods = Object.getOwnPropertyNames(
                    Object.getPrototypeOf(fileExplorer),
                );
                log(methods.join(", "), this.plugin);

                if (fileExplorer.view) {
                    log("File explorer view methods:", this.plugin);
                    const viewMethods = Object.getOwnPropertyNames(
                        Object.getPrototypeOf(fileExplorer.view),
                    );
                    log(viewMethods.join(", "), this.plugin);
                }
            }

            return fileExplorer;
        } catch (error) {
            logError(`Error accessing file explorer: ${error}`);
            return null;
        }
    }

    /**
     * Event handler for when a folder is chosen from the suggestion list
     */
    onChooseItem(folder: TFolder, evt: MouseEvent | KeyboardEvent): void {
        // Check if this is a separator and ignore if so
        if ((folder as any)._isSeparator) {
            return;
        }

        log(
            `Folder selected: "${folder.path}" (name: "${folder.name}")`,
            this.plugin,
        );

        try {
            // Update folder history
            this.updateFolderHistory(folder);

            // Close the modal first
            this.close();

            // Make sure the file explorer is visible
            const fileExplorerLeaves =
                this.app.workspace.getLeavesOfType("file-explorer");
            if (fileExplorerLeaves.length === 0) {
                logError("No file explorer leaf found");
                return;
            }

            const fileExplorerLeaf = fileExplorerLeaves[0];
            this.app.workspace.revealLeaf(fileExplorerLeaf);
            log("File explorer leaf revealed", this.plugin);

            // Get the file explorer instance
            const fileExplorer = this.getFileExplorer();
            if (!fileExplorer) {
                logError("Failed to get file explorer instance");
                return;
            }

            // Step 1: Reveal the folder in the file explorer
            log(`Revealing folder in explorer: "${folder.path}"`, this.plugin);
            fileExplorer.revealInFolder(folder);

            // Step 2: Wait a bit for the UI to update, then expand folders using DOM
            setTimeout(() => {
                if (this.plugin.settings.expandTargetFolder) {
                    // Get all parent folders in order
                    log(
                        `Expanding parent folders for: "${folder.path}"`,
                        this.plugin,
                    );
                    const parentFolders = this.getParentFolderChain(folder);
                    log(
                        `Parent chain: ${parentFolders.map((f) => f.name).join(" -> ")}`,
                        this.plugin,
                    );

                    // First, expand all parent folders in order from root to leaf
                    parentFolders.forEach((parentFolder, index) => {
                        // Use increasing delays to ensure proper sequence
                        setTimeout(() => {
                            this.expandFolderByDOMClick(parentFolder.name);
                        }, index * 50);
                    });

                    // Then expand the target folder itself (after parents are expanded)
                    setTimeout(
                        () => {
                            log(
                                `Expanding target folder: "${folder.name}"`,
                                this.plugin,
                            );
                            this.expandFolderByDOMClick(folder.name);

                            // Highlight the folder after expansion
                            setTimeout(() => {
                                this.highlightFolderInDOM(folder.name);
                            }, 200);
                        },
                        parentFolders.length * 50 + 100,
                    );
                } else {
                    // Just highlight the folder if we're not expanding
                    setTimeout(() => {
                        this.highlightFolderInDOM(folder.name);
                    }, 200);
                }
            }, 100);
        } catch (error) {
            logError(`Error in folder navigation: ${error}`);
        }
    }

    /**
     * Expand a folder by finding and clicking its title directly in the DOM
     */
    private expandFolderByDOMClick(folderName: string): void {
        try {
            log(`Looking for folder to expand: "${folderName}"`, this.plugin);

            // Find all folder title content elements
            const allTitleContents = document.querySelectorAll(
                ".nav-folder-title-content",
            );

            for (const titleContent of Array.from(allTitleContents)) {
                if (titleContent.textContent === folderName) {
                    log(
                        `Found folder title content: "${folderName}"`,
                        this.plugin,
                    );

                    // Get the title element
                    const titleElement =
                        titleContent.closest(".nav-folder-title");
                    if (!(titleElement instanceof HTMLElement)) {
                        log(
                            `Could not find title element for: "${folderName}"`,
                            this.plugin,
                        );
                        continue;
                    }

                    // Get the folder element
                    const folderElement = titleContent.closest(".nav-folder");
                    if (!(folderElement instanceof HTMLElement)) {
                        log(
                            `Could not find folder element for: "${folderName}"`,
                            this.plugin,
                        );
                        continue;
                    }

                    // Check if it's collapsed
                    if (folderElement.classList.contains("is-collapsed")) {
                        log(
                            `Folder is collapsed, clicking title to expand: "${folderName}"`,
                            this.plugin,
                        );
                        // Click the title element directly - this is more reliable than the collapse indicator
                        titleElement.click();
                        return;
                    } else {
                        log(
                            `Folder already expanded: "${folderName}"`,
                            this.plugin,
                        );
                        return;
                    }
                }
            }

            log(
                `Could not find folder with name: "${folderName}"`,
                this.plugin,
            );
        } catch (error) {
            logError(`Error expanding folder: ${error}`);
        }
    }

    /**
     * Highlight a folder in the DOM by finding and styling its title
     */
    private highlightFolderInDOM(folderName: string): void {
        try {
            log(
                `Looking for folder to highlight: "${folderName}"`,
                this.plugin,
            );

            // Find all folder title content elements
            const allTitleContents = document.querySelectorAll(
                ".nav-folder-title-content",
            );

            for (const titleContent of Array.from(allTitleContents)) {
                if (titleContent.textContent === folderName) {
                    log(
                        `Found folder to highlight: "${folderName}"`,
                        this.plugin,
                    );

                    // Get the title element
                    const titleElement =
                        titleContent.closest(".nav-folder-title");
                    if (!(titleElement instanceof HTMLElement)) {
                        continue;
                    }

                    // Scroll into view
                    titleElement.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                    });

                    // Add highlighting class
                    titleElement.classList.add("nav-folder-title-highlighted");

                    // Remove after delay
                    setTimeout(() => {
                        titleElement.classList.remove(
                            "nav-folder-title-highlighted",
                        );
                    }, 2000);

                    return;
                }
            }

            log(
                `Could not find folder to highlight: "${folderName}"`,
                this.plugin,
            );
        } catch (error) {
            logError(`Error highlighting folder: ${error}`);
        }
    }

    // Override the renderSuggestion method to customize how folders are displayed
    renderSuggestion(item: FuzzyMatch<TFolder>, el: HTMLElement): void {
        // Check if this is a separator
        if ((item.item as any)._isSeparator) {
            el.empty();
            const separatorEl = el.createDiv({
                cls: "folder-separator",
            });
            separatorEl.setText((item.item as any)._separatorText);
            return;
        }

        // Custom rendering with keyword highlighting
        el.empty();
        const folder = item.item;
        const folderPath = folder.path;

        // Get match positions from the fuzzy match result
        const matches = item.match?.matches || [];

        if (matches.length === 0) {
            // No matches, just display the text normally
            el.setText(folderPath);
            return;
        }

        // Sort matches by position
        const sortedMatches = matches.slice().sort((a, b) => a[0] - b[0]);

        // Build the highlighted text
        let lastIndex = 0;
        const textEl = el.createDiv({ cls: "suggestion-content" });

        for (const match of sortedMatches) {
            const [start, end] = match;

            // Add text before the match
            if (start > lastIndex) {
                textEl.appendText(folderPath.substring(lastIndex, start));
            }

            // Add the matched text with highlighting
            const matchEl = textEl.createSpan({ cls: "suggestion-highlight" });
            matchEl.setText(folderPath.substring(start, end + 1));

            lastIndex = end + 1;
        }

        // Add remaining text after the last match
        if (lastIndex < folderPath.length) {
            textEl.appendText(folderPath.substring(lastIndex));
        }
    }
}
