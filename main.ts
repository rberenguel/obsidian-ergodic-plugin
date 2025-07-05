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
import { ErgodicWalk } from "./ergodic-walk";

interface ErgodicPluginSettings {
	excludedPaths: string;
	excludedTags: string;
	jumpInterval: number;
	showTimerBar: boolean;
}

const DEFAULT_SETTINGS: ErgodicPluginSettings = {
	excludedPaths: "",
	excludedTags: "",
	jumpInterval: 0,
	showTimerBar: true,
};

export default class ErgodicPlugin extends Plugin {
	settings: ErgodicPluginSettings;
	private walk: ErgodicWalk;
	private ribbonIconEl: HTMLElement;
	private statusBarItemEl: HTMLElement;
	private timerBarEl: HTMLElement | null = null;

	private readonly stopWalkOnUIClick = (evt: MouseEvent) => {
		if (this.ribbonIconEl.contains(evt.target as Node)) {
			return; // Click was on the ribbon icon, so ignore it here.
		}
		this.walk.stop();
		new Notice("Ergodic random walk stopped.");
	};

	async onload() {
		await this.loadSettings();
		this.statusBarItemEl = this.addStatusBarItem();

		this.walk = new ErgodicWalk({
			onJump: () => this.handleJump(),
			onStateChange: (isActive, interval) =>
				this.handleStateChange(isActive, interval),
		});

		this.addCommand({
			id: "open-random-note-and-walk",
			name: "Open random note and start walk",
			callback: () => this.toggleWalk(),
		});
		this.addCommand({
			id: "open-random-note-no-timer",
			name: "Open random note (no timer)",
			hotkeys: [{ modifiers: ["Alt"], key: "r" }],
			callback: async () => {
				// Ensure any active walk is stopped before a single jump
				if (this.walk.isActive) {
					this.walk.stop();
				}
				await this.openRandomNote();
			},
		});

		this.ribbonIconEl = this.addRibbonIcon("shuffle", "Ergodic", () =>
			this.toggleWalk(),
		);

		this.updateRibbonTooltip();
		this.addSettingTab(new ErgodicSettingTab(this.app, this));
	}

	onunload() {
		this.walk.stop();
	}

	toggleWalk() {
		if (this.walk.isActive) {
			this.walk.stop();
			new Notice("Ergodic random walk stopped.");
		} else {
			this.walk.start(this.settings.jumpInterval * 1000);
		}
	}

	private async handleJump(): Promise<boolean> {
		const success = await this.openRandomNote();
		if (success && this.settings.showTimerBar) {
			this.injectTimerBar();
		}
		return success;
	}

	private handleStateChange(isActive: boolean, interval: number) {
		if (isActive) {
			setIcon(this.ribbonIconEl, "pause");
			this.ribbonIconEl.setAttribute("aria-label", "Stop ergodic walk");
			this.registerStopListener();
		} else {
			setIcon(this.ribbonIconEl, "shuffle");
			this.updateRibbonTooltip();
			this.unregisterStopListener();
			this.removeTimerBar();
		}
		this.updateStatusBar(isActive, interval);
	}

	updateRibbonTooltip() {
		const interval = this.settings.jumpInterval;
		const title =
			interval > 0
				? `Ergodic: Open random note (every ${interval}s)`
				: "Ergodic: Open random note";
		this.ribbonIconEl?.setAttribute("aria-label", title);
	}

	private updateStatusBar(isActive: boolean, interval: number) {
		if (isActive) {
			const text = `🎲 Ergodic walk active (${interval / 1000}s)`;
			this.statusBarItemEl.setText(text);
			this.statusBarItemEl.style.display = "block";
		} else {
			this.statusBarItemEl.style.display = "none";
		}
	}
	private injectTimerBar() {
		this.removeTimerBar();
		const viewContent =
			this.app.workspace.activeLeaf?.view.containerEl.querySelector(
				".view-content",
			);
		if (!viewContent) return;
		const container = document.createElement("div");
		container.className = "ergodic-timer-container";
		const bar = document.createElement("div");
		bar.className = "ergodic-timer-bar";
		bar.style.animationDuration = `${this.settings.jumpInterval}s`;
		container.appendChild(bar);
		viewContent.prepend(container);
		this.timerBarEl = container;
	}
	private removeTimerBar() {
		this.timerBarEl?.remove();
		this.timerBarEl = null;
	}
	private registerStopListener() {
		document.body.addEventListener("click", this.stopWalkOnUIClick, true);
	}
	private unregisterStopListener() {
		document.body.removeEventListener(
			"click",
			this.stopWalkOnUIClick,
			true,
		);
	}

	private async openRandomNote(): Promise<boolean> {
		const eligibleFiles = await this.getEligibleFiles();
		if (eligibleFiles.length === 0) {
			new Notice("No eligible notes found to open.");
			return false;
		}
		const file =
			eligibleFiles[Math.floor(Math.random() * eligibleFiles.length)];
		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(file);
		return true;
	}
	private async getEligibleFiles(): Promise<TFile[]> {
		const files = this.app.vault.getMarkdownFiles();
		const { excludedPaths, excludedTags } = this.settings;
		const pathsToExclude = excludedPaths
			.split(",")
			.map((p) => p.trim())
			.filter((p) => p);
		const tagsToExclude = new Set(
			excludedTags
				.split(",")
				.map((t) => `#${t.trim()}`)
				.filter((t) => t.length > 1),
		);
		if (pathsToExclude.length === 0 && tagsToExclude.size === 0) {
			return files;
		}
		const eligibleFiles: TFile[] = [];
		for (const file of files) {
			if (pathsToExclude.some((p) => file.path.startsWith(p))) {
				continue;
			}
			if (tagsToExclude.size > 0) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache) {
					const fileTags = new Set(getAllTags(cache));
					const hasExcludedTag = [...tagsToExclude].some((t) =>
						fileTags.has(t),
					);
					if (hasExcludedTag) {
						continue;
					}
				}
			}
			eligibleFiles.push(file);
		}
		return eligibleFiles;
	}
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}
	async saveSettings() {
		await this.saveData(this.settings);
		this.updateRibbonTooltip();
	}
}

class ErgodicSettingTab extends PluginSettingTab {
	plugin: ErgodicPlugin;
	constructor(app: App, plugin: ErgodicPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Ergodic Settings" });
		new Setting(containerEl)
			.setName("Excluded folder paths")
			.setDesc(
				"Comma-separated list of paths to exclude. Notes within these folders will not be opened.",
			)
			.addTextArea((text) =>
				text
					.setPlaceholder("templates/, daily/")
					.setValue(this.plugin.settings.excludedPaths)
					.onChange(async (value) => {
						this.plugin.settings.excludedPaths = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Excluded tags")
			.setDesc(
				"Comma-separated list of tags to exclude (without the #). Notes with these tags will not be opened.",
			)
			.addTextArea((text) =>
				text
					.setPlaceholder("archived, idea, person")
					.setValue(this.plugin.settings.excludedTags)
					.onChange(async (value) => {
						this.plugin.settings.excludedTags = value;
						await this.plugin.saveSettings();
					}),
			);
		containerEl.createEl("h3", { text: "Auto-Jump" });
		new Setting(containerEl)
			.setName("Jump interval (seconds)")
			.setDesc(
				"If > 0, the main command/ribbon button will start a timed walk. Set to 0 to disable.",
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.jumpInterval.toString())
					.onChange(async (value) => {
						this.plugin.settings.jumpInterval =
							parseInt(value) || 0;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Show visual timer bar")
			.setDesc(
				"If enabled, a progress bar will be shown at the top of the note during a timed walk.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTimerBar)
					.onChange(async (value) => {
						this.plugin.settings.showTimerBar = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
