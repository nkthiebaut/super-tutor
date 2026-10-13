export const REVIEW_TAG = "#review";

export const INITIAL_EASE = 2.5;
export const MIN_EASE = 1.3;

export const DEFAULT_MODEL = "gpt-5";
export const QUESTIONS_PER_GENERATION = 3;
export const MAX_NOTE_CHARS = 12_000;

export interface Question {
	id: string;
	prompt: string;
	answer: string;
}

export interface CardState {
	ease: number;
	intervalDays: number;
	repetitions: number;
	due: string;
	questions: Question[];
}

export interface PluginSettings {
	openaiApiKey: string;
	model: string;
}

export interface PluginData {
	settings: PluginSettings;
	cards: Record<string, CardState>;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	openaiApiKey: "",
	model: DEFAULT_MODEL,
};

export type Grade = "again" | "hard" | "good" | "easy";

export const GRADES: readonly Grade[] = ["again", "hard", "good", "easy"];

export const GRADE_QUALITY: Record<Grade, number> = {
	again: 1,
	hard: 3,
	good: 4,
	easy: 5,
};
