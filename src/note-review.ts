import { escapeLatexInJson, normalizeLatex } from "./latex";

export const MAX_NOTE_EDITS = 12;

export const NOTE_EDIT_CATEGORIES = ["veracity", "consistency", "quality", "addition"] as const;

export type NoteEditCategory = (typeof NOTE_EDIT_CATEGORIES)[number];

export interface NoteEdit {
	category: NoteEditCategory;
	original: string;
	replacement: string;
	reason: string;
}

export interface NoteReview {
	assessment: string;
	edits: NoteEdit[];
}

export interface ApplyEditsResult {
	markdown: string;
	applied: number;
	missed: number;
}

const CATEGORIES = new Set<string>(NOTE_EDIT_CATEGORIES);

export const NOTE_REVIEW_SYSTEM_PROMPT = `You check a markdown note for veracity, internal consistency, writing quality, and useful missing information, then propose precise edits.
Respond with JSON of the form {"assessment":"...","edits":[{"category":"veracity"|"consistency"|"quality"|"addition","original":"...","replacement":"...","reason":"..."}]}.

Veracity: flag claims that are false or that contradict established knowledge. If you are not confident a claim is wrong, leave it alone. Do not add citations or facts the author did not imply.
Consistency: flag contradictions, terms or notation that change meaning, and references that do not match each other.
Quality: flag unclear, redundant, or broken passages, including broken markdown or LaTeX, when a small rewrite would make the note easier to understand. Do not propose an edit unless it clearly helps.
Addition: suggest concise, directly relevant information that would materially improve understanding, such as an important implication, caveat, example, definition, or connection. Add only well-established information you are confident is accurate. Avoid trivia, filler, speculative claims, and unnecessary expansion.

Each original must be an exact contiguous copy of text in the note, including markdown, so it can be found and replaced. Do not paraphrase original. Each replacement is the full text that should take its place, not a description of the change. For an addition, use a nearby passage as original and return that unchanged passage plus the new material as replacement, placing the new material where it belongs. An empty replacement deletes that excerpt. Keep the author's voice and the note's structure. Propose only the passages that should change or additions that materially help, at most ${MAX_NOTE_EDITS} edits, most important first. If the note is sound and complete, return an empty edits array and say so in assessment.

Write math in replacement as LaTeX with $...$ for inline math and $$...$$ for display math. Never use \\(...\\) or \\[...\\]. Use real LaTeX commands such as \\log, not \\text{...} wrappers around command names. Because the response is JSON, escape every backslash as a double backslash. In original, copy the note's characters exactly.`;

export function noteEditCategoryLabel(category: NoteEditCategory): string {
	switch (category) {
		case "veracity":
			return "Veracity";
		case "consistency":
			return "Consistency";
		case "quality":
			return "Quality";
		case "addition":
			return "Addition";
	}
}

export function parseNoteReview(payload: unknown): NoteReview | null {
	const content = readMessageContent(payload);
	if (!content) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(escapeLatexInJson(unwrapFence(content)));
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") {
		return null;
	}
	const record = parsed as { assessment?: unknown; edits?: unknown };
	const assessmentText = typeof record.assessment === "string" ? record.assessment.trim() : "";
	const hasEdits = Array.isArray(record.edits);
	if (!hasEdits && !assessmentText) {
		return null;
	}
	const edits = hasEdits ? parseEdits(record.edits as unknown[]) : [];
	let assessment = assessmentText;
	if (!assessment) {
		assessment = edits.length > 0 ? "This note has proposed edits." : "No issues found.";
	}
	return { assessment, edits };
}

/**
 * Replaces each excerpt once, preferring an exact match. Later edits that overlap an
 * earlier match are left unchanged. Frontmatter and unmatched text stay as they are.
 */
export function applyEditsToMarkdown(markdown: string, edits: readonly NoteEdit[]): ApplyEditsResult {
	const used: Array<[number, number]> = [];
	const spans: Array<{ start: number; end: number; replacement: string }> = [];
	let missed = 0;
	for (const edit of edits) {
		if (!edit.original || edit.original === edit.replacement) {
			continue;
		}
		const span = findSpan(markdown, edit.original, used);
		if (!span) {
			missed += 1;
			continue;
		}
		used.push([span.start, span.end]);
		spans.push({ start: span.start, end: span.end, replacement: edit.replacement });
	}
	spans.sort((a, b) => b.start - a.start);
	let next = markdown;
	for (const span of spans) {
		next = next.slice(0, span.start) + span.replacement + next.slice(span.end);
	}
	return { markdown: next, applied: spans.length, missed };
}

function parseEdits(items: unknown[]): NoteEdit[] {
	const edits: NoteEdit[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		if (edits.length >= MAX_NOTE_EDITS) {
			break;
		}
		if (!item || typeof item !== "object") {
			continue;
		}
		const record = item as { category?: unknown; original?: unknown; replacement?: unknown; reason?: unknown };
		const category = typeof record.category === "string" ? record.category.trim().toLowerCase() : "";
		if (!isCategory(category)) {
			continue;
		}
		if (typeof record.original !== "string" || !record.original.trim()) {
			continue;
		}
		if (typeof record.replacement !== "string") {
			continue;
		}
		const original = record.original;
		const replacement = normalizeLatex(record.replacement);
		if (original === replacement || seen.has(original)) {
			continue;
		}
		seen.add(original);
		const reason = typeof record.reason === "string" ? record.reason.trim() : "";
		edits.push({ category, original, replacement, reason });
	}
	return edits;
}

function isCategory(value: string): value is NoteEditCategory {
	return CATEGORIES.has(value);
}

function findSpan(
	markdown: string,
	excerpt: string,
	used: ReadonlyArray<readonly [number, number]>,
): { start: number; end: number } | null {
	for (const candidate of excerptCandidates(excerpt)) {
		let from = 0;
		while (from <= markdown.length) {
			const start = markdown.indexOf(candidate, from);
			if (start === -1) {
				break;
			}
			const end = start + candidate.length;
			const overlaps = used.some(([usedStart, usedEnd]) => start < usedEnd && end > usedStart);
			if (!overlaps) {
				return { start, end };
			}
			from = start + 1;
		}
	}
	return null;
}

function excerptCandidates(excerpt: string): string[] {
	const candidates = [excerpt];
	const trimmed = excerpt.trim();
	if (trimmed && trimmed !== excerpt) {
		candidates.push(trimmed);
	}
	const withCrlf = excerpt.replace(/\r?\n/g, "\r\n");
	if (!candidates.includes(withCrlf)) {
		candidates.push(withCrlf);
	}
	if (trimmed) {
		const trimmedCrlf = trimmed.replace(/\r?\n/g, "\r\n");
		if (!candidates.includes(trimmedCrlf)) {
			candidates.push(trimmedCrlf);
		}
	}
	return candidates;
}

function unwrapFence(content: string): string {
	const fenced = /^```(?:json)?\s*([\s\S]*?)```\s*$/.exec(content.trim());
	return fenced?.[1] ?? content;
}

function readMessageContent(payload: unknown): string | null {
	if (!payload || typeof payload !== "object" || !("choices" in payload)) {
		return null;
	}
	const choices = (payload as { choices?: unknown }).choices;
	if (!Array.isArray(choices) || choices.length === 0) {
		return null;
	}
	const first = choices[0] as { message?: { content?: unknown } } | undefined;
	const content = first?.message?.content;
	return typeof content === "string" ? content : null;
}
