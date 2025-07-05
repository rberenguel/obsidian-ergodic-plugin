import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	Notice,
	getAllTags,
} from "obsidian";

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
	private ribbonIconEl: HTMLElement;
	private timerId: NodeJS.Timeout | null = null;
	private statusBarItemEl: HTMLElement;
	private timerBarEl: HTMLElement | null = null;

	private readonly stopWalkHandler = () => {
		this.stopRandomWalk(true);
	};

	async onload() {
		await this.loadSettings();
		this.statusBarItemEl = this.addStatusBarItem();

		// Main command for timed walk (mirrors ribbon button)
		this.addCommand({
			id: "open-random-note-and-walk",
			name: "Open random note and start walk",
			callback: () => this.toggleWalk(),
		});

		// Secondary command for a single jump with no timer
		this.addCommand({
			id: "open-random-note-no-timer",
			name: "Open random note (no timer)",
			hotkeys: [{ modifiers: ["Alt"], key: "r" }],
			callback: () => this.performJump(false),
		});

		this.ribbonIconEl = this.addRibbonIcon(
			"shuffle",
			"Ergodic", // Initial title, will be updated immediately
			() => this.toggleWalk(),
		);

		this.updateUIMessages();
		this.addSettingTab(new ErgodicSettingTab(this.app, this));
	}

	onunload() {
		this.stopRandomWalk(false);
	}

	/** Toggles the timed walk on and off. */
	toggleWalk() {
		if (this.timerId) {
			this.stopRandomWalk(true);
		} else {
			this.performJump(true);
		}
	}

	/**
	 * Opens a random note and optionally starts a timed walk.
	 * @param useTimer If true, will start a timed walk based on settings.
	 */
	async performJump(useTimer: boolean) {
		// Stop any existing walk before starting a new action
		if (this.timerId) {
			this.stopRandomWalk(false);
		} else {
			// If no timer is running, still clean up any stray UI elements
			this.removeTimerBar();
		}

		if (await this.openRandomNote()) {
			const shouldStartTimer =
				useTimer && this.settings.jumpInterval > 0;
			if (shouldStartTimer) {
				this.updateStatusBar(true);
				if (this.settings.showTimerBar) {
					this.injectTimerBar();
				}
				this.registerStopListener();
				this.timerId = setTimeout(() => {
					this.performJump(true); // Recursive call for the walk
				}, this.settings.jumpInterval * 1000);
			}
		}
	}

	stopRandomWalk(showNotice: boolean) {
		if (this.timerId) {
			clearTimeout(this.timerId);
			this.timerId = null;
			if (showNotice) new Notice("Ergodic random walk stopped.");
		}
		this.updateStatusBar(false);
		this.unregisterStopListener();
		this.removeTimerBar();
	}

	updateUIMessages() {
		const interval = this.settings.jumpInterval;
		const title =
			interval > 0
				? `Ergodic: Open random note (every ${interval}s)`
				: "Ergodic: Open random note";
		this.ribbonIconEl?.setAttribute("aria-label", title);
	}

	private injectTimerBar() {
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
		document.body.addEventListener("click", this.stopWalkHandler, true);
	}

	private unregisterStopListener() {
		document.body.removeEventListener("click", this.stopWalkHandler, true);
	}

	private updateStatusBar(active: boolean) {
		if (active) {
			const interval = this.settings.jumpInterval;
			const text = `🎲 Ergodic walk active (${interval}s)`;
			this.statusBarItemEl.setText(text);
			this.statusBarItemEl.style.display = "block";
		} else {
			this.statusBarItemEl.style.display = "none";
		}
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
		this.updateUIMessages();
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