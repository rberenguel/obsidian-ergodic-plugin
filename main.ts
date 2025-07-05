// main.ts

import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	Notice,
	getAllTags,
	setIcon,
} from "obsidian";
import { ErgodicWalk, WalkConfig } from "./ergodic-walk";

interface ErgodicPluginSettings {
	excludedPaths: string;
	excludedTags: string;
	leisureInterval: number;
	fastInterval: number;
	showTimerBar: boolean;
}

const DEFAULT_SETTINGS: ErgodicPluginSettings = {
	excludedPaths: "",
	excludedTags: "",
	leisureInterval: 15,
	fastInterval: 2,
	showTimerBar: true,
};

export default class ErgodicPlugin extends Plugin {
	settings: ErgodicPluginSettings;
	private walk: ErgodicWalk;
	private leisureRibbonEl: HTMLElement;
	private fastRibbonEl: HTMLElement;
	private statusBarItemEl: HTMLElement;
	private timerBarEl: HTMLElement | null = null;

	private readonly stopWalkOnUIClick = (evt: MouseEvent) => {
		if (
			this.leisureRibbonEl.contains(evt.target as Node) ||
			this.fastRibbonEl.contains(evt.target as Node)
		) {
			return;
		}
		if (this.walk.isActive) {
			this.walk.stop();
			new Notice("Ergodic random walk stopped.");
		}
	};

	async onload() {
		await this.loadSettings();
		this.statusBarItemEl = this.addStatusBarItem();

		this.walk = new ErgodicWalk({
			onJump: (config) => this.handleJump(config),
			onStateChange: (isActive, config) => this.handleStateChange(isActive, config),
		});

		// --- Commands ---
		this.addCommand({ id: "toggle-leisure-walk", name: "Toggle Leisure Walk", callback: () => this.handleLeisureClick() });
		this.addCommand({ id: "toggle-fast-walk", name: "Toggle Fast Walk", callback: () => this.handleFastClick() });
		this.addCommand({
			id: "jump-once",
			name: "Jump Once (no timer)",
			hotkeys: [{ modifiers: ["Alt"], key: "r" }],
			callback: () => {
				// The logic to stop a walk is now correctly placed here, not in openRandomNote
				if (this.walk.isActive) {
					this.walk.stop();
				}
				this.openRandomNote();
			}
		});

		// --- Ribbon Buttons ---
		this.leisureRibbonEl = this.addRibbonIcon("shuffle", "", () => this.handleLeisureClick());
		this.fastRibbonEl = this.addRibbonIcon("fast-forward", "", () => this.handleFastClick());
		this.updateTooltips();

		this.addSettingTab(new ErgodicSettingTab(this.app, this));
	}

	onunload() { this.walk.stop(); }

	private handleLeisureClick() {
		if (this.walk.isActive) {
			this.walk.stop();
			new Notice("Ergodic random walk stopped.");
		} else {
			this.walk.start({ interval: this.settings.leisureInterval * 1000, showBar: this.settings.showTimerBar });
		}
	}

	private handleFastClick() {
		if (this.walk.isActive) {
			this.walk.stop();
			new Notice("Ergodic random walk stopped.");
		} else {
			this.walk.start({ interval: this.settings.fastInterval * 1000, showBar: false });
		}
	}

	private async handleJump(config: WalkConfig): Promise<boolean> {
		const success = await this.openRandomNote();
		if (success && config.showBar) {
			this.injectTimerBar(config.interval);
		}
		return success;
	}

	private handleStateChange(isActive: boolean, config: WalkConfig | null) {
		if (isActive) {
			setIcon(this.leisureRibbonEl, "pause");
			setIcon(this.fastRibbonEl, "pause");
			const stopTitle = "Stop Ergodic Walk";
			this.leisureRibbonEl.setAttribute("aria-label", stopTitle);
			this.fastRibbonEl.setAttribute("aria-label", stopTitle);
			this.registerStopListener();
		} else {
			setIcon(this.leisureRibbonEl, "shuffle");
			setIcon(this.fastRibbonEl, "fast-forward");
			this.updateTooltips();
			this.unregisterStopListener();
			this.removeTimerBar();
		}
		this.updateStatusBar(isActive, config);
	}

	updateTooltips() {
		const leisureTitle = `Start Leisure Walk (${this.settings.leisureInterval}s)`;
		const fastTitle = `Start Fast Walk (${this.settings.fastInterval}s)`;
		this.leisureRibbonEl?.setAttribute("aria-label", leisureTitle);
		this.fastRibbonEl?.setAttribute("aria-label", fastTitle);
	}

	private updateStatusBar(isActive: boolean, config: WalkConfig | null) {
		if (isActive && config) {
			const text = `🎲 Ergodic walk active (${config.interval / 1000}s)`;
			this.statusBarItemEl.setText(text);
			this.statusBarItemEl.style.display = "block";
		} else {
			this.statusBarItemEl.style.display = "none";
		}
	}
	
	private injectTimerBar(intervalMs: number) {
		this.removeTimerBar();
		const viewContent = this.app.workspace.activeLeaf?.view.containerEl.querySelector(".view-content");
		if (!viewContent) return;
		const container = document.createElement("div");
		container.className = "ergodic-timer-container";
		const bar = document.createElement("div");
		bar.className = "ergodic-timer-bar";
		bar.style.animationDuration = `${intervalMs / 1000}s`;
		container.appendChild(bar);
		viewContent.prepend(container);
		this.timerBarEl = container;
	}
	
	private removeTimerBar() { this.timerBarEl?.remove(); this.timerBarEl = null; }
	private registerStopListener() { document.body.addEventListener("click", this.stopWalkOnUIClick, true); }
	private unregisterStopListener() { document.body.removeEventListener("click", this.stopWalkOnUIClick, true); }

	// This function is now clean and only does what its name implies.
	private async openRandomNote(): Promise<boolean> {
		const eligibleFiles = await this.getEligibleFiles();
		if (eligibleFiles.length === 0) { new Notice("No eligible notes found to open."); return false; }
		const file = eligibleFiles[Math.floor(Math.random() * eligibleFiles.length)];
		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(file);
		return true;
	}

	private async getEligibleFiles(): Promise<TFile[]> {
		const files = this.app.vault.getMarkdownFiles();
		const { excludedPaths, excludedTags } = this.settings;
		const pathsToExclude = excludedPaths.split(",").map((p) => p.trim()).filter((p) => p);
		const tagsToExclude = new Set(excludedTags.split(",").map((t) => `#${t.trim()}`).filter((t) => t.length > 1));
		if (pathsToExclude.length === 0 && tagsToExclude.size === 0) { return files; }
		const eligibleFiles: TFile[] = [];
		for (const file of files) {
			if (pathsToExclude.some((p) => file.path.startsWith(p))) { continue; }
			if (tagsToExclude.size > 0) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache) {
					const fileTags = new Set(getAllTags(cache));
					const hasExcludedTag = [...tagsToExclude].some((t) => fileTags.has(t));
					if (hasExcludedTag) { continue; }
				}
			}
			eligibleFiles.push(file);
		}
		return eligibleFiles;
	}
	async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
	async saveSettings() { await this.saveData(this.settings); this.updateTooltips(); }
}

class ErgodicSettingTab extends PluginSettingTab {
	plugin: ErgodicPlugin;
	constructor(app: App, plugin: ErgodicPlugin) { super(app, plugin); this.plugin = plugin; }
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Ergodic Settings" });

		new Setting(containerEl).setName("Excluded folder paths").setDesc("Comma-separated list of paths to exclude.").addTextArea((text) => text.setPlaceholder("templates/, daily/").setValue(this.plugin.settings.excludedPaths).onChange(async (value) => { this.plugin.settings.excludedPaths = value; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName("Excluded tags").setDesc("Comma-separated list of tags to exclude (without the #).").addTextArea((text) => text.setPlaceholder("archived, meta").setValue(this.plugin.settings.excludedTags).onChange(async (value) => { this.plugin.settings.excludedTags = value; await this.plugin.saveSettings(); }));
		
		containerEl.createEl("h3", { text: "Leisure Walk" });
		new Setting(containerEl).setName("Leisure interval (seconds)").setDesc("Speed for the 'Leisure Walk' mode (shuffle icon).").addText((text) => text.setValue(this.plugin.settings.leisureInterval.toString()).onChange(async (value) => { this.plugin.settings.leisureInterval = parseInt(value) || 15; await this.plugin.saveSettings(); }));
		new Setting(containerEl).setName("Show visual timer bar").setDesc("If enabled, a progress bar will be shown during a Leisure Walk.").addToggle((toggle) => toggle.setValue(this.plugin.settings.showTimerBar).onChange(async (value) => { this.plugin.settings.showTimerBar = value; await this.plugin.saveSettings(); }));

		containerEl.createEl("h3", { text: "Fast Walk" });
		new Setting(containerEl).setName("Fast interval (seconds)").setDesc("Speed for the 'Fast Walk' mode (fast-forward icon). The timer bar is always hidden in this mode.").addText((text) => text.setValue(this.plugin.settings.fastInterval.toString()).onChange(async (value) => { this.plugin.settings.fastInterval = parseInt(value) || 2; await this.plugin.saveSettings(); }));
	}
}