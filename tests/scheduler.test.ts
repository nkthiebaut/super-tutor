import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, applyGrade, daysBetween, previewIntervals } from "../src/scheduler";
import { INITIAL_EASE, MIN_EASE } from "../src/types";

const fresh = { ease: INITIAL_EASE, intervalDays: 0, repetitions: 0 };

describe("applyGrade", () => {
	it("schedules the first successful review for 1 day and keeps ease on Good", () => {
		const next = applyGrade(fresh, "good", "2026-10-12");
		assert.equal(next.intervalDays, 1);
		assert.equal(next.repetitions, 1);
		assert.equal(next.ease, INITIAL_EASE);
		assert.equal(next.due, "2026-10-13");
	});

	it("uses a 6 day interval on the second successful review", () => {
		const once = applyGrade(fresh, "good", "2026-10-12");
		const twice = applyGrade(once, "good", "2026-10-13");
		assert.equal(twice.intervalDays, 6);
		assert.equal(twice.repetitions, 2);
		assert.equal(twice.ease, INITIAL_EASE);
		assert.equal(twice.due, "2026-10-19");
	});

	it("multiplies the interval by the updated ease after the second success", () => {
		const once = applyGrade(fresh, "good", "2026-01-01");
		const twice = applyGrade(once, "easy", "2026-01-02");
		const third = applyGrade(twice, "good", "2026-01-08");
		assert.equal(twice.ease, INITIAL_EASE + 0.1);
		assert.equal(third.intervalDays, Math.round(6 * twice.ease));
		assert.equal(third.repetitions, 3);
		assert.equal(third.ease, twice.ease);
	});

	it("resets repetitions when the answer is Again and lowers ease", () => {
		const learned = applyGrade(applyGrade(fresh, "good", "2026-01-01"), "good", "2026-01-02");
		const failed = applyGrade(learned, "again", "2026-01-08");
		assert.equal(failed.repetitions, 0);
		assert.equal(failed.intervalDays, 1);
		assert.equal(failed.due, "2026-01-09");
		assert.ok(failed.ease < learned.ease);
	});

	it("lowers ease on Hard and raises it on Easy", () => {
		const hard = applyGrade(fresh, "hard", "2026-01-01");
		const easy = applyGrade(fresh, "easy", "2026-01-01");
		assert.ok(hard.ease < INITIAL_EASE);
		assert.equal(easy.ease, INITIAL_EASE + 0.1);
		assert.equal(hard.intervalDays, 1);
		assert.equal(easy.intervalDays, 1);
	});

	it("does not let ease fall below 1.3", () => {
		let state = fresh;
		for (let i = 0; i < 8; i++) {
			state = applyGrade(state, "again", "2026-01-01");
		}
		assert.equal(state.ease, MIN_EASE);
	});

	it("previews the same intervals the grade would save", () => {
		const state = applyGrade(applyGrade(fresh, "good", "2026-01-01"), "good", "2026-01-02");
		const previews = previewIntervals(state);
		assert.equal(previews.good, applyGrade(state, "good", "2026-01-08").intervalDays);
		assert.equal(previews.again, applyGrade(state, "again", "2026-01-08").intervalDays);
		assert.equal(previews.hard, applyGrade(state, "hard", "2026-01-08").intervalDays);
		assert.equal(previews.easy, applyGrade(state, "easy", "2026-01-08").intervalDays);
	});
});

describe("dates", () => {
	it("rolls across month boundaries", () => {
		assert.equal(addDays("2026-01-31", 1), "2026-02-01");
		assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
	});
});
