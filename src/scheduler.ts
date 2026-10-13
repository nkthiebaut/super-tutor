import { GRADE_QUALITY, INITIAL_EASE, MIN_EASE, type Grade } from "./types";

export interface ScheduleState {
	ease: number;
	intervalDays: number;
	repetitions: number;
}

export interface ScheduledReview extends ScheduleState {
	due: string;
}

/**
 * Classic SM-2. Ease updates first, then a successful review uses
 * 1 day, then 6 days, then round(interval * updated ease).
 * Quality below 3 starts over at 1 day with repetitions reset.
 */
export function applyGrade(state: ScheduleState, grade: Grade, today: string): ScheduledReview {
	const quality = GRADE_QUALITY[grade];
	let ease = state.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
	if (ease < MIN_EASE) {
		ease = MIN_EASE;
	}

	let repetitions: number;
	let intervalDays: number;
	if (quality < 3) {
		repetitions = 0;
		intervalDays = 1;
	} else {
		repetitions = state.repetitions + 1;
		if (state.repetitions <= 0) {
			intervalDays = 1;
		} else if (state.repetitions === 1) {
			intervalDays = 6;
		} else {
			intervalDays = Math.round(state.intervalDays * ease);
		}
	}

	if (intervalDays < 1) {
		intervalDays = 1;
	}

	return {
		ease,
		intervalDays,
		repetitions,
		due: addDays(today, intervalDays),
	};
}

export function previewIntervals(state: ScheduleState): Record<Grade, number> {
	return {
		again: applyGrade(state, "again", "2000-01-01").intervalDays,
		hard: applyGrade(state, "hard", "2000-01-01").intervalDays,
		good: applyGrade(state, "good", "2000-01-01").intervalDays,
		easy: applyGrade(state, "easy", "2000-01-01").intervalDays,
	};
}

export function newSchedule(today: string): ScheduledReview {
	return {
		ease: INITIAL_EASE,
		intervalDays: 0,
		repetitions: 0,
		due: today,
	};
}

export function todayString(now = new Date()): string {
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function addDays(isoDate: string, days: number): string {
	const parsed = parseIsoDate(isoDate);
	if (!parsed) {
		return todayString();
	}
	parsed.setDate(parsed.getDate() + days);
	return todayString(parsed);
}

export function daysBetween(from: string, to: string): number {
	const start = parseIsoDate(from);
	const end = parseIsoDate(to);
	if (!start || !end) {
		return 0;
	}
	const msPerDay = 24 * 60 * 60 * 1000;
	return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

export function isDue(due: string, today: string): boolean {
	return due <= today;
}

export function formatInterval(days: number): string {
	return days === 1 ? "1d" : `${days}d`;
}

export function dueLabel(due: string, today: string): string {
	const late = daysBetween(due, today);
	if (late > 1) {
		return `${late}d overdue`;
	}
	if (late === 1) {
		return "1d overdue";
	}
	if (late === 0) {
		return "Due today";
	}
	if (late === -1) {
		return "Due tomorrow";
	}
	return `Due in ${-late}d`;
}

export function gradeLabel(grade: Grade): string {
	return grade.charAt(0).toUpperCase() + grade.slice(1);
}

function parseIsoDate(iso: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) {
		return null;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
		return null;
	}
	return date;
}
