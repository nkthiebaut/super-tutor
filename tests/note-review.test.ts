import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyEditsToMarkdown, parseNoteReview, type NoteEdit } from "../src/note-review";

function payload(content: string): unknown {
	return { choices: [{ message: { content } }] };
}

function edit(partial: Pick<NoteEdit, "original" | "replacement"> & Partial<NoteEdit>): NoteEdit {
	return {
		category: partial.category ?? "quality",
		original: partial.original,
		replacement: partial.replacement,
		reason: partial.reason ?? "",
	};
}

describe("parseNoteReview", () => {
	it("reads an assessment and categorized edits", () => {
		const review = parseNoteReview(
			payload(
				JSON.stringify({
					assessment: "One claim is wrong.",
					edits: [
						{
							category: "Veracity",
							original: "The sum is 1+1=3.",
							replacement: "The sum is 1+1=2.",
							reason: "1+1 is 2.",
						},
					],
				}),
			),
		);
		assert.deepEqual(review, {
			assessment: "One claim is wrong.",
			edits: [
				{
					category: "veracity",
					original: "The sum is 1+1=3.",
					replacement: "The sum is 1+1=2.",
					reason: "1+1 is 2.",
				},
			],
		});
	});

	it("repairs LaTeX in the replacement and keeps the original excerpt intact", () => {
		const review = parseNoteReview(
			payload(String.raw`{"assessment":"Fix the formula.","edits":[{"category":"quality","original":"see \\(x\\)","replacement":"$\\theta$","reason":"use dollars"}]}`),
		);
		assert.equal(review?.edits[0]?.original, String.raw`see \(x\)`);
		assert.equal(review?.edits[0]?.replacement, String.raw`$\theta$`);
	});

	it("drops invalid edits and reports a clean note", () => {
		const review = parseNoteReview(
			payload(
				JSON.stringify({
					assessment: "Looks consistent.",
					edits: [{ category: "style", original: "x", replacement: "y", reason: "no" }],
				}),
			),
		);
		assert.deepEqual(review, { assessment: "Looks consistent.", edits: [] });
	});

	it("accepts useful additions anchored to existing note text", () => {
		const review = parseNoteReview(
			payload(
				JSON.stringify({
					assessment: "A caveat would help.",
					edits: [
						{
							category: "addition",
							original: "Correlation does not imply causation.",
							replacement:
								"Correlation does not imply causation.\n\nA confounding variable can influence both correlated variables.",
							reason: "Adds a useful explanation.",
						},
					],
				}),
			),
		);
		assert.equal(review?.edits[0]?.category, "addition");
		const result = applyEditsToMarkdown("Correlation does not imply causation.", review?.edits ?? []);
		assert.equal(
			result.markdown,
			"Correlation does not imply causation.\n\nA confounding variable can influence both correlated variables.",
		);
	});

	it("accepts an empty edit list without an assessment", () => {
		const review = parseNoteReview(payload('{"edits":[]}'));
		assert.deepEqual(review, { assessment: "No issues found.", edits: [] });
	});

	it("reads a review wrapped in a json fence", () => {
		const review = parseNoteReview(payload('```json\n{"assessment":"Ok.","edits":[]}\n```'));
		assert.deepEqual(review, { assessment: "Ok.", edits: [] });
	});

	it("returns null when the response is not a review", () => {
		assert.equal(parseNoteReview(payload("not json")), null);
		assert.equal(parseNoteReview(payload("{}")), null);
		assert.equal(parseNoteReview({}), null);
	});

	it("keeps at most 12 edits and ignores a repeated excerpt", () => {
		const edits = [
			{ category: "consistency", original: "passage 0", replacement: "fixed 0", reason: "" },
			{ category: "consistency", original: "passage 0", replacement: "other", reason: "dup" },
			...Array.from({ length: 13 }, (_, index) => ({
				category: "consistency",
				original: `passage ${index + 1}`,
				replacement: `fixed ${index + 1}`,
				reason: "",
			})),
		];
		const review = parseNoteReview(payload(JSON.stringify({ assessment: "Several issues.", edits })));
		assert.equal(review?.edits.length, 12);
		assert.equal(review?.edits[0]?.original, "passage 0");
		assert.equal(review?.edits[0]?.replacement, "fixed 0");
		assert.equal(review?.edits.some((item) => item.replacement === "other"), false);
	});
});

describe("applyEditsToMarkdown", () => {
	it("replaces the excerpt and leaves frontmatter alone", () => {
		const result = applyEditsToMarkdown("---\ntags: [review]\n---\n\nThe sum is 1+1=3.\n", [
			edit({ category: "veracity", original: "1+1=3", replacement: "1+1=2", reason: "arithmetic" }),
		]);
		assert.equal(result.applied, 1);
		assert.equal(result.missed, 0);
		assert.equal(result.markdown, "---\ntags: [review]\n---\n\nThe sum is 1+1=2.\n");
	});

	it("deletes a passage when the replacement is empty", () => {
		const result = applyEditsToMarkdown("Keep this. Remove this.", [
			edit({ original: " Remove this.", replacement: "" }),
		]);
		assert.equal(result.markdown, "Keep this.");
		assert.equal(result.applied, 1);
	});

	it("matches Windows newlines and a trimmed excerpt", () => {
		const result = applyEditsToMarkdown("alpha\r\nbeta\r\n", [
			edit({ original: "alpha\nbeta", replacement: "gamma" }),
		]);
		assert.equal(result.markdown, "gamma\r\n");
		const trimmed = applyEditsToMarkdown("hello world", [edit({ original: " hello ", replacement: "hi" })]);
		assert.equal(trimmed.markdown, "hi world");
	});

	it("skips excerpts that are missing or overlap an earlier edit", () => {
		const result = applyEditsToMarkdown("The quick brown fox.", [
			edit({ original: "quick brown", replacement: "slow" }),
			edit({ original: "brown fox", replacement: "dog" }),
			edit({ original: "missing", replacement: "gone" }),
		]);
		assert.equal(result.markdown, "The slow fox.");
		assert.equal(result.applied, 1);
		assert.equal(result.missed, 2);
	});

	it("replaces only the first unmatched occurrence", () => {
		const result = applyEditsToMarkdown("cat and cat", [edit({ original: "cat", replacement: "dog" })]);
		assert.equal(result.markdown, "dog and cat");
	});
});
