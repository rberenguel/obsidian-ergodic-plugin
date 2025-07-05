import { vi, test, expect, describe, beforeEach, afterEach } from "vitest";
import { ErgodicWalk, ErgodicWalkCallbacks, WalkConfig } from "../ergodic-walk"; // Adjust path if needed

describe("ErgodicWalk", () => {
	let walk: ErgodicWalk;
	let callbacks: ErgodicWalkCallbacks;
	const leisureConfig: WalkConfig = { interval: 15000, showBar: true };
	const fastConfig: WalkConfig = { interval: 2000, showBar: false };

	// Set up fake timers and mock callbacks before each test
	beforeEach(() => {
		vi.useFakeTimers();
		callbacks = {
			onJump: vi.fn().mockResolvedValue(true),
			onStateChange: vi.fn(),
		};
		walk = new ErgodicWalk(callbacks);
	});

	// Clean up timers after each test
	afterEach(() => {
		vi.useRealTimers();
	});

	test("should not start if interval is 0", async () => {
		await walk.start({ interval: 0, showBar: true });
		expect(walk.isActive).toBe(false);
	});

	test("should start, perform an initial jump, and set state correctly", async () => {
		await walk.start(leisureConfig);

		expect(walk.isActive).toBe(true);
		expect(callbacks.onStateChange).toHaveBeenCalledWith(
			true,
			leisureConfig,
		);
		expect(callbacks.onJump).toHaveBeenCalledWith(leisureConfig);
		expect(callbacks.onJump).toHaveBeenCalledTimes(1);
	});

	test("should perform a second jump after the interval", async () => {
		await walk.start(fastConfig);
		expect(callbacks.onJump).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(fastConfig.interval);

		expect(callbacks.onJump).toHaveBeenCalledTimes(2);
		// Ensure the config is passed on the second jump as well
		expect(callbacks.onJump).toHaveBeenLastCalledWith(fastConfig);
	});

	test("should stop the timer and update state when stop() is called", async () => {
		await walk.start(leisureConfig);
		expect(walk.isActive).toBe(true); // Sanity check

		walk.stop();

		expect(walk.isActive).toBe(false);
		expect(callbacks.onStateChange).toHaveBeenLastCalledWith(false, null);

		// Advance time to ensure no more jumps occur
		await vi.advanceTimersByTimeAsync(leisureConfig.interval * 2);
		expect(callbacks.onJump).toHaveBeenCalledTimes(1); // Still 1 from the initial jump
	});

	test("should stop automatically if a jump fails", async () => {
		callbacks.onJump = vi.fn().mockResolvedValue(false);
		walk = new ErgodicWalk(callbacks);

		await walk.start(leisureConfig);

		// onStateChange is called with true, then immediately with false when the jump fails.
		expect(callbacks.onStateChange).toHaveBeenCalledTimes(2);
		expect(callbacks.onStateChange).toHaveBeenLastCalledWith(false, null);
		expect(walk.isActive).toBe(false);
	});

	test("should stop an active walk when a new walk is started", async () => {
		// 1. Start a leisure walk
		await walk.start(leisureConfig);
		expect(walk.isActive).toBe(true);
		expect(callbacks.onJump).toHaveBeenCalledWith(leisureConfig);
		expect(callbacks.onStateChange).toHaveBeenCalledWith(
			true,
			leisureConfig,
		);

		// 2. Start a fast walk, which should interrupt the leisure walk
		await walk.start(fastConfig);
		expect(walk.isActive).toBe(true);
		expect(callbacks.onJump).toHaveBeenCalledWith(fastConfig);

		// 3. Check the sequence of state changes
		// Call 1: start leisure (true)
		// Call 2: stop leisure (false) because new walk is starting
		// Call 3: start fast (true)
		expect(callbacks.onStateChange).toHaveBeenCalledTimes(3);
		expect(callbacks.onStateChange).toHaveBeenCalledWith(false, null);
		expect(callbacks.onStateChange).toHaveBeenLastCalledWith(
			true,
			fastConfig,
		);

		// 4. Advance timer by the new, fast interval and check for jump
		await vi.advanceTimersByTimeAsync(fastConfig.interval);
		expect(callbacks.onJump).toHaveBeenCalledTimes(3); // 1 for leisure, 1 for fast start, 1 for fast continue
	});
});
