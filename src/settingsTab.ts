import {
    App,
    PluginSettingTab,
    Setting,
    DropdownComponent,
    Modal,
    Notice,
    FuzzySuggestModal,
    TFolder,
} from "obsidian";
import FolderNavigatorPlugin from "./main";
import { FolderDisplayMode } from "./settings";

/**
 * Modal for searching and selecting a folder for new folder creation location
 */
class FolderSelectionModal extends FuzzySuggestModal<TFolder> {
    plugin: FolderNavigatorPlugin;
    onSelect: (folder: TFolder) => void;

    constructor(
        app: App,
        plugin: FolderNavigatorPlugin,
        onSelect: (folder: TFolder) => void,
    ) {
        super(app);
        this.plugin = plugin;
        this.onSelect = onSelect;
        this.setPlaceholder("Search for a folder...");
    }

    getItems(): TFolder[] {
        return this.app.vault.getAllFolders();
    }

    getItemText(folder: TFolder): string {
        return folder.path || "/";
    }

    onChooseItem(folder: TFolder): void {
        this.onSelect(folder);
    }
}

export class SettingsTab extends PluginSettingTab {
    plugin: FolderNavigatorPlugin;

    // Keep track of settings elements for dynamic updates
    recentFoldersSettingEl: HTMLElement;
    frequentFoldersSettingEl: HTMLElement;
    resetHistorySettingEl: HTMLElement;

    constructor(app: App, plugin: FolderNavigatorPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Updates visibility of settings based on the current display mode
     */
    updateSettingsVisibility(displayMode: FolderDisplayMode): void {
        // Create settings elements if they don't exist yet
        if (
            !this.recentFoldersSettingEl ||
            !this.frequentFoldersSettingEl ||
            !this.resetHistorySettingEl
        ) {
            return;
        }

        // Handle recent folders setting
        if (displayMode === FolderDisplayMode.RECENCY) {
            this.recentFoldersSettingEl.style.display = "block";
            this.frequentFoldersSettingEl.style.display = "none";
        } else if (displayMode === FolderDisplayMode.FREQUENCY) {
            this.recentFoldersSettingEl.style.display = "none";
            this.frequentFoldersSettingEl.style.display = "block";
        } else {
            // Default mode - hide both
            this.recentFoldersSettingEl.style.display = "none";
            this.frequentFoldersSettingEl.style.display = "none";
        }

        // Only show reset history button for non-default modes
        if (displayMode === FolderDisplayMode.DEFAULT) {
            this.resetHistorySettingEl.style.display = "none";
        } else {
            this.resetHistorySettingEl.style.display = "block";
        }
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // General settings section
        new Setting(containerEl)
            .setName("Maximum results")
            .setDesc("Maximum number of folders to show in search results")
            .addSlider((slider) =>
                slider
                    .setLimits(5, 50, 5)
                    .setValue(this.plugin.settings.maxResults)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.maxResults = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Expand target folder on navigation")
            .setDesc(
                "When enabled, folders will be automatically expanded when you navigate to them",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.expandTargetFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.expandTargetFolder = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // New folder creation section
        new Setting(containerEl).setName("Folder creation").setHeading();

        new Setting(containerEl)
            .setName("Default location for new folders")
            .setDesc(
                "Choose where new folders will be created when using the 'Create folder' option. Default is the vault root.",
            )
            .addButton((button) => {
                const displayPath =
                    this.plugin.settings.newFolderLocation || "/ (Root)";
                button.setButtonText(displayPath).onClick(() => {
                    const modal = new FolderSelectionModal(
                        this.app,
                        this.plugin,
                        async (folder: TFolder) => {
                            this.plugin.settings.newFolderLocation =
                                folder.path;
                            await this.plugin.saveSettings();
                            button.setButtonText(folder.path || "/ (Root)");
                        },
                    );
                    modal.open();
                });
            })
            .addExtraButton((button) => {
                button
                    .setIcon("reset")
                    .setTooltip("Reset to root folder")
                    .onClick(async () => {
                        this.plugin.settings.newFolderLocation = "";
                        await this.plugin.saveSettings();
                        // Update button text by recreating the setting
                        this.display();
                    });
            });

        // Folder display preferences section
        new Setting(containerEl)
            .setName("Folder display preferences")
            .setHeading();

        // Display priority setting
        new Setting(containerEl)
            .setName("Display priority")
            .setDesc(
                "Control which folders appear at the top of the suggestion list before searching",
            )
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption(
                        FolderDisplayMode.DEFAULT,
                        "Default order (alphabetical)",
                    )
                    .addOption(
                        FolderDisplayMode.RECENCY,
                        "Recently visited first",
                    )
                    .addOption(
                        FolderDisplayMode.FREQUENCY,
                        "Frequently visited first",
                    )
                    .setValue(this.plugin.settings.folderDisplayMode)
                    .onChange(async (value: string) => {
                        this.plugin.settings.folderDisplayMode =
                            value as FolderDisplayMode;
                        await this.plugin.saveSettings();

                        // Update the visibility of settings when selection changes
                        this.updateSettingsVisibility(
                            value as FolderDisplayMode,
                        );
                    });
            });

        // Create recent folders setting
        this.recentFoldersSettingEl = containerEl.createDiv();
        new Setting(this.recentFoldersSettingEl)
            .setName("Recent folders to show")
            .setDesc(
                "Number of recently visited folders to display at the top when using 'Recently visited first' mode",
            )
            .addSlider((slider) =>
                slider
                    .setLimits(1, 20, 1)
                    .setValue(this.plugin.settings.recentFoldersToShow)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.recentFoldersToShow = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Create frequent folders setting
        this.frequentFoldersSettingEl = containerEl.createDiv();
        new Setting(this.frequentFoldersSettingEl)
            .setName("Frequent folders to show")
            .setDesc(
                "Number of frequently visited folders to display at the top when using 'Frequently visited first' mode",
            )
            .addSlider((slider) =>
                slider
                    .setLimits(1, 20, 1)
                    .setValue(this.plugin.settings.frequentFoldersToShow)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.frequentFoldersToShow = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Add reset history button in its own container
        this.resetHistorySettingEl = containerEl.createDiv();
        new Setting(this.resetHistorySettingEl)
            .setName("Reset folder history")
            .setDesc(
                "Clear the tracked history of visited folders. Warning: This will remove all recency and frequency data.",
            )
            .addButton((button) =>
                button
                    .setButtonText("Reset")
                    .setWarning()
                    .onClick(async () => {
                        // Create a confirmation modal
                        const confirmModal = new Modal(this.app);
                        confirmModal.titleEl.setText("Reset folder history");
                        confirmModal.contentEl.createEl("p", {
                            text: "Are you sure? This will permanently delete all folder navigation history including recently visited and frequently used folder data.",
                            cls: "mod-warning",
                        });

                        const buttonContainer =
                            confirmModal.contentEl.createDiv({
                                cls: "modal-button-container",
                            });

                        // Cancel button
                        buttonContainer
                            .createEl("button", {
                                text: "Cancel",
                            })
                            .addEventListener("click", () => {
                                confirmModal.close();
                            });

                        // Confirm button
                        const confirmButton = buttonContainer.createEl(
                            "button",
                            {
                                text: "Reset folder history",
                                cls: "mod-warning",
                            },
                        );
                        confirmButton.addEventListener("click", async () => {
                            this.plugin.settings.folderHistory = {};
                            await this.plugin.saveSettings();
                            confirmModal.close();
                            new Notice("Folder history has been reset");
                        });

                        confirmModal.open();
                    }),
            );

        // Initialize settings visibility based on current display mode
        this.updateSettingsVisibility(this.plugin.settings.folderDisplayMode);

        // Add advanced section
        new Setting(containerEl).setName("Advanced").setHeading();

        new Setting(containerEl)
            .setName("Debug mode")
            .setDesc(
                "Enable detailed logging to console for troubleshooting issues. This may affect performance and should be disabled during normal use.",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.debugMode)
                    .onChange(async (value) => {
                        this.plugin.settings.debugMode = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
