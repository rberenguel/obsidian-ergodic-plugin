// tests/ergodic-walk.test.ts

import { vi, test, expect, describe, beforeEach, afterEach } from "vitest";
import { ErgodicWalk, ErgodicWalkCallbacks } from "../ergodic-walk";

describe("ErgodicWalk", () => {
	let walk: ErgodicWalk;
	let callbacks: ErgodicWalkCallbacks;

	beforeEach(() => {
		vi.useFakeTimers();
		callbacks = {
			onJump: vi.fn().mockResolvedValue(true),
			onStateChange: vi.fn(),
		};
		walk = new ErgodicWalk(callbacks);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("should not start if interval is 0", async () => {
		await walk.start(0);
		expect(walk.isActive).toBe(false);
	});

	test("should start, perform an initial jump, and set state correctly", async () => {
		await walk.start(5000);

		expect(walk.isActive).toBe(true);
		expect(callbacks.onStateChange).toHaveBeenCalledWith(true, 5000);
		expect(callbacks.onJump).toHaveBeenCalledTimes(1);
	});

	test("should perform a second jump after the interval", async () => {
		await walk.start(5000);
		expect(callbacks.onJump).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(5000);

		expect(callbacks.onJump).toHaveBeenCalledTimes(2);
	});

	test("should stop the timer and update state when stop() is called", async () => {
		await walk.start(5000);
		expect(walk.isActive).toBe(true);

		walk.stop();

		expect(walk.isActive).toBe(false);
		expect(callbacks.onStateChange).toHaveBeenLastCalledWith(false, 0);

		await vi.advanceTimersByTimeAsync(10000);
		expect(callbacks.onJump).toHaveBeenCalledTimes(1);
	});

	test("should not enter an active state if the first jump fails", async () => {
		callbacks.onJump = vi.fn().mockResolvedValue(false);
		walk = new ErgodicWalk(callbacks);

		await walk.start(5000);

		// It calls onStateChange(true) optimistically, then immediately onStateChange(false) when it fails.
		expect(callbacks.onStateChange).toHaveBeenCalledTimes(2);
		expect(callbacks.onStateChange).toHaveBeenLastCalledWith(false, 0);
		expect(walk.isActive).toBe(false);
	});
});
