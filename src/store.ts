import { normalizeLatex } from "./latex";
import { newSchedule, todayString } from "./scheduler";
import {
	DEFAULT_MODEL,
	DEFAULT_SETTINGS,
	type CardState,
	type PluginData,
	type PluginSettings,
	type Question,
} from "./types";

// Older versions saved their default model into settings, so it would otherwise mask DEFAULT_MODEL.
const PREVIOUS_DEFAULT_MODELS = new Set(["gpt-4o-mini", "gpt-5"]);

export function createId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyData(): PluginData {
	return {
		settings: { ...DEFAULT_SETTINGS },
		cards: {},
	};
}

export class ReviewStore {
	data: PluginData;

	constructor(data: PluginData) {
		this.data = data;
	}

	static fromLoaded(raw: unknown): ReviewStore {
		return new ReviewStore(normalizeData(raw));
	}

	getCard(path: string): CardState | undefined {
		return this.data.cards[path];
	}

	ensureCard(path: string, today = todayString()): CardState {
		const existing = this.data.cards[path];
		if (existing) {
			return existing;
		}
		const card = emptyCard(today);
		this.data.cards[path] = card;
		return card;
	}

	resetSchedules(paths: readonly string[], today: string): void {
		for (const path of paths) {
			const card = this.ensureCard(path, today);
			const schedule = newSchedule(today);
			card.ease = schedule.ease;
			card.intervalDays = schedule.intervalDays;
			card.repetitions = schedule.repetitions;
			card.due = schedule.due;
		}
	}

	movePath(oldPath: string, newPath: string): boolean {
		if (oldPath === newPath) {
			return false;
		}
		const oldPrefix = oldPath.endsWith("/") ? oldPath : `${oldPath}/`;
		const newPrefix = newPath.endsWith("/") ? newPath : `${newPath}/`;
		const moves: Array<{ from: string; to: string }> = [];
		for (const key of Object.keys(this.data.cards)) {
			if (key === oldPath) {
				moves.push({ from: key, to: newPath });
			} else if (key.startsWith(oldPrefix)) {
				moves.push({ from: key, to: newPrefix + key.slice(oldPrefix.length) });
			}
		}
		if (moves.length === 0) {
			return false;
		}

		const staged = new Map<string, CardState>();
		for (const move of moves) {
			const card = this.data.cards[move.from];
			if (card) {
				staged.set(move.to, card);
			}
		}
		for (const move of moves) {
			delete this.data.cards[move.from];
		}
		for (const [path, card] of staged) {
			this.data.cards[path] = card;
		}
		return true;
	}

	deletePath(path: string): boolean {
		let changed = false;
		if (this.data.cards[path]) {
			delete this.data.cards[path];
			changed = true;
		}
		const prefix = path.endsWith("/") ? path : `${path}/`;
		for (const key of Object.keys(this.data.cards)) {
			if (key.startsWith(prefix)) {
				delete this.data.cards[key];
				changed = true;
			}
		}
		return changed;
	}
}

function emptyCard(today: string): CardState {
	return {
		...newSchedule(today),
		questions: [],
	};
}

function normalizeData(raw: unknown): PluginData {
	const data = emptyData();
	if (!raw || typeof raw !== "object") {
		return data;
	}
	const record = raw as Partial<PluginData>;
	data.settings = normalizeSettings(record.settings);
	if (record.cards && typeof record.cards === "object") {
		for (const [path, card] of Object.entries(record.cards)) {
			const normalized = normalizeCard(card);
			if (normalized) {
				data.cards[path] = normalized;
			}
		}
	}
	return data;
}

function normalizeSettings(raw: unknown): PluginSettings {
	const settings = { ...DEFAULT_SETTINGS };
	if (!raw || typeof raw !== "object") {
		return settings;
	}
	const record = raw as Partial<PluginSettings>;
	if (typeof record.openaiApiKey === "string") {
		settings.openaiApiKey = record.openaiApiKey;
	}
	if (typeof record.model === "string" && record.model.trim() && !PREVIOUS_DEFAULT_MODELS.has(record.model.trim())) {
		settings.model = record.model.trim();
	} else {
		settings.model = DEFAULT_MODEL;
	}
	return settings;
}

function normalizeCard(raw: unknown): CardState | null {
	if (!raw || typeof raw !== "object") {
		return null;
	}
	const record = raw as Partial<CardState>;
	const today = todayString();
	const schedule = newSchedule(today);
	const ease = typeof record.ease === "number" && Number.isFinite(record.ease) ? record.ease : schedule.ease;
	const intervalDays =
		typeof record.intervalDays === "number" && Number.isFinite(record.intervalDays)
			? Math.max(0, Math.round(record.intervalDays))
			: schedule.intervalDays;
	const repetitions =
		typeof record.repetitions === "number" && Number.isFinite(record.repetitions)
			? Math.max(0, Math.round(record.repetitions))
			: schedule.repetitions;
	const due = typeof record.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.due) ? record.due : today;
	const questions = Array.isArray(record.questions) ? record.questions.flatMap(normalizeQuestion) : [];
	return { ease, intervalDays, repetitions, due, questions };
}

function normalizeQuestion(raw: unknown): Question[] {
	if (!raw || typeof raw !== "object") {
		return [];
	}
	const record = raw as Partial<Question>;
	if (typeof record.prompt !== "string" || !record.prompt.trim()) {
		return [];
	}
	return [
		{
			id: typeof record.id === "string" && record.id ? record.id : createId(),
			prompt: normalizeLatex(record.prompt),
			answer: typeof record.answer === "string" ? normalizeLatex(record.answer) : "",
		},
	];
}
