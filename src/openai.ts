import { Notice, requestUrl, type TFile } from "obsidian";
import { escapeLatexInJson, normalizeLatex } from "./latex";
import type SuperTutorPlugin from "./main";
import { NOTE_REVIEW_SYSTEM_PROMPT, parseNoteReview, type NoteReview } from "./note-review";
import { DEFAULT_MODEL, MAX_NOTE_CHARS, QUESTIONS_PER_GENERATION } from "./types";

export interface GeneratedQuestion {
	prompt: string;
	answer: string;
}

const SYSTEM_PROMPT = `You write review questions that test understanding of a note.
Respond with JSON of the form {"questions":[{"prompt":"...","answer":"..."}]}.
Each prompt is one question. Each answer is a short reference answer supported by the note.
Do not invent facts that are not in the note.
Write math as LaTeX with $...$ for inline math and $$...$$ for display math. Never use \\(...\\) or \\[...\\].
Use real LaTeX commands such as \\log, \\odot, and \\beta, not \\text{...} wrappers around command names.
Because the response is JSON, escape every LaTeX backslash as a double backslash.
Write exactly the requested number of questions.`;

export function stripFrontmatter(markdown: string): string {
	const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
	if (!match) {
		return markdown;
	}
	return markdown.slice(match[0].length);
}

export async function generateQuestions(plugin: SuperTutorPlugin, file: TFile): Promise<GeneratedQuestion[] | null> {
	if (!hasApiKey(plugin)) {
		return null;
	}
	const note = await readNoteExcerpt(plugin, file, "This note has no content to generate questions from.");
	if (!note) {
		return null;
	}

	const count = QUESTIONS_PER_GENERATION;
	try {
		const payload = await chatJson(
			plugin,
			SYSTEM_PROMPT,
			`Write ${count} questions about this note as JSON.\n\n# ${file.basename}\n\n${note.body}`,
		);
		const questions = parseQuestions(payload, count);
		if (questions.length !== count) {
			new Notice(`ChatGPT returned ${questions.length} valid questions instead of ${count}. Nothing was added.`);
			return null;
		}
		if (note.truncated) {
			new Notice(`The note was longer than ${MAX_NOTE_CHARS.toLocaleString()} characters, so only the start was sent.`);
		}
		return questions;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Request failed";
		new Notice(`Could not generate questions. ${message}`);
		return null;
	}
}

export async function verifyNote(plugin: SuperTutorPlugin, file: TFile): Promise<NoteReview | null> {
	if (!hasApiKey(plugin)) {
		return null;
	}
	const note = await readNoteExcerpt(plugin, file, "This note has no content to check.");
	if (!note) {
		return null;
	}

	try {
		const payload = await chatJson(
			plugin,
			NOTE_REVIEW_SYSTEM_PROMPT,
			`Check this note and propose corrections, improvements, and useful additions as JSON.\n\n# ${file.basename}\n\n${note.body}`,
		);
		const review = parseNoteReview(payload);
		if (!review) {
			new Notice("ChatGPT did not return a usable review.");
			return null;
		}
		if (note.truncated) {
			new Notice(`The note was longer than ${MAX_NOTE_CHARS.toLocaleString()} characters, so only the start was checked.`);
		}
		return review;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Request failed";
		new Notice(`Could not check the note. ${message}`);
		return null;
	}
}

function hasApiKey(plugin: SuperTutorPlugin): boolean {
	if (!plugin.store.data.settings.openaiApiKey.trim()) {
		new Notice("Add an OpenAI API key in Super Tutor settings.");
		return false;
	}
	return true;
}

async function readNoteExcerpt(
	plugin: SuperTutorPlugin,
	file: TFile,
	emptyMessage: string,
): Promise<{ body: string; truncated: boolean } | null> {
	const raw = await plugin.app.vault.cachedRead(file);
	let body = stripFrontmatter(raw).trim();
	if (!body) {
		new Notice(emptyMessage);
		return null;
	}
	let truncated = false;
	if (body.length > MAX_NOTE_CHARS) {
		body = body.slice(0, MAX_NOTE_CHARS);
		truncated = true;
	}
	return { body, truncated };
}

async function chatJson(plugin: SuperTutorPlugin, system: string, user: string): Promise<unknown> {
	const settings = plugin.store.data.settings;
	const model = settings.model.trim() || DEFAULT_MODEL;
	const response = await requestUrl({
		url: "https://api.openai.com/v1/chat/completions",
		method: "POST",
		throw: true,
		headers: {
			Authorization: `Bearer ${settings.openaiApiKey.trim()}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			response_format: { type: "json_object" },
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
		}),
	});
	return response.json;
}

export function parseQuestions(payload: unknown, limit: number): GeneratedQuestion[] {
	const content = readMessageContent(payload);
	if (!content) {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(escapeLatexInJson(content));
	} catch {
		return [];
	}
	if (!parsed || typeof parsed !== "object" || !("questions" in parsed)) {
		return [];
	}
	const questions = parsed.questions;
	if (!Array.isArray(questions)) {
		return [];
	}
	const result: GeneratedQuestion[] = [];
	for (const item of questions) {
		if (result.length >= limit) {
			break;
		}
		if (!item || typeof item !== "object") {
			continue;
		}
		const record = item as { prompt?: unknown; answer?: unknown };
		if (typeof record.prompt !== "string" || !record.prompt.trim()) {
			continue;
		}
		if (typeof record.answer !== "string" || !record.answer.trim()) {
			continue;
		}
		result.push({
			prompt: normalizeLatex(record.prompt.trim()),
			answer: normalizeLatex(record.answer.trim()),
		});
	}
	return result;
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
