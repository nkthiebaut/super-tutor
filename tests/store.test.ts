import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReviewStore } from "../src/store";
import { INITIAL_EASE } from "../src/types";

describe("ReviewStore", () => {
	it("keeps questions when a schedule is reset", () => {
		const store = ReviewStore.fromLoaded({});
		const card = store.ensureCard("notes/topic.md", "2026-10-12");
		card.questions.push({ id: "q1", prompt: "Why?", answer: "Because." });
		card.ease = 2.1;
		card.intervalDays = 12;
		card.repetitions = 4;
		card.due = "2026-11-01";

		store.resetSchedules(["notes/topic.md"], "2026-10-12");

		const reset = store.getCard("notes/topic.md");
		assert.ok(reset);
		assert.equal(reset.ease, INITIAL_EASE);
		assert.equal(reset.intervalDays, 0);
		assert.equal(reset.repetitions, 0);
		assert.equal(reset.due, "2026-10-12");
		assert.deepEqual(reset.questions, [{ id: "q1", prompt: "Why?", answer: "Because." }]);
	});

	it("moves a note card and every card under a renamed folder", () => {
		const store = ReviewStore.fromLoaded({});
		store.ensureCard("notes/a.md", "2026-10-12").ease = 2.2;
		store.ensureCard("notes/nested/b.md", "2026-10-12").ease = 2.4;
		store.ensureCard("other.md", "2026-10-12");

		assert.equal(store.movePath("notes", "archive"), true);

		assert.equal(store.getCard("notes/a.md"), undefined);
		assert.equal(store.getCard("archive/a.md")?.ease, 2.2);
		assert.equal(store.getCard("archive/nested/b.md")?.ease, 2.4);
		assert.ok(store.getCard("other.md"));
		assert.equal(store.movePath("missing", "gone"), false);
	});

	it("drops cards for a deleted note or folder", () => {
		const store = ReviewStore.fromLoaded({});
		store.ensureCard("notes/a.md", "2026-10-12");
		store.ensureCard("notes/b.md", "2026-10-12");
		store.ensureCard("keep.md", "2026-10-12");

		assert.equal(store.deletePath("notes"), true);

		assert.equal(store.getCard("notes/a.md"), undefined);
		assert.equal(store.getCard("notes/b.md"), undefined);
		assert.ok(store.getCard("keep.md"));
	});

	it("repairs incomplete cards and fills missing settings", () => {
		const store = ReviewStore.fromLoaded({
			settings: { openaiApiKey: "sk-test" },
			cards: {
				"ok.md": {
					ease: 2,
					intervalDays: 3,
					repetitions: 1,
					due: "2026-10-01",
					questions: [{ prompt: "Q", answer: "A" }, { prompt: " " }],
				},
				"bad.md": { ease: "nope" },
				"gone.md": "nope",
			},
		});

		assert.equal(store.data.settings.openaiApiKey, "sk-test");
		assert.equal(store.data.settings.model, "gpt-5");
		assert.equal(ReviewStore.fromLoaded({ settings: { model: "gpt-4o-mini" } }).data.settings.model, "gpt-5");
		assert.equal(ReviewStore.fromLoaded({ settings: { model: "gpt-4.1" } }).data.settings.model, "gpt-4.1");
		assert.equal(store.getCard("gone.md"), undefined);
		assert.equal(store.getCard("bad.md")?.ease, INITIAL_EASE);
		const card = store.getCard("ok.md");
		assert.ok(card);
		assert.equal(card.questions.length, 1);
		assert.equal(card.questions[0]?.prompt, "Q");
		assert.ok(card.questions[0]?.id);
	});
});