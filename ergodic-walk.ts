// ergodic-walk.ts

export interface WalkConfig {
	interval: number;
	showBar: boolean;
}

export interface ErgodicWalkCallbacks {
	onJump: (config: WalkConfig) => Promise<boolean>;
	onStateChange: (isActive: boolean, config: WalkConfig | null) => void;
}

export class ErgodicWalk {
	private timerId: NodeJS.Timeout | null = null;
	private currentConfig: WalkConfig | null = null;
	private callbacks: ErgodicWalkCallbacks;

	constructor(callbacks: ErgodicWalkCallbacks) {
		this.callbacks = callbacks;
	}

	public get isActive(): boolean {
		return this.timerId !== null;
	}

	public async start(config: WalkConfig): Promise<void> {
		if (this.isActive) {
			this.stop();
		}
		if (config.interval <= 0) return;

		this.currentConfig = config;
		this.timerId = setTimeout(() => {}, config.interval);
		this.callbacks.onStateChange(true, this.currentConfig);

		const success = await this.callbacks.onJump(this.currentConfig);

		if (!this.isActive) return;

		if (success) {
			this.timerId = setTimeout(
				() => this.continue(),
				this.currentConfig.interval,
			);
		} else {
			this.stop();
		}
	}

	public stop(): void {
		if (!this.isActive) return;
		clearTimeout(this.timerId!);
		this.timerId = null;
		this.callbacks.onStateChange(false, null);
	}

	private async continue(): Promise<void> {
		if (!this.isActive) return;
		const success = await this.callbacks.onJump(this.currentConfig!);
		if (success && this.isActive) {
			this.timerId = setTimeout(
				() => this.continue(),
				this.currentConfig!.interval,
			);
		} else {
			this.stop();
		}
	}

	/** Forces an immediate jump and restarts the timer. */
	public forceNext(): void {
		if (!this.isActive) return;
		this.start(this.currentConfig!);
	}

	/** Restarts the timer without forcing an immediate jump. */
	public resetTimer(): void {
		if (!this.isActive) return;
		clearTimeout(this.timerId!);
		this.timerId = setTimeout(
			() => this.continue(),
			this.currentConfig!.interval,
		);
	}
}
