import { Notice, Plugin, TFile, type TAbstractFile } from "obsidian";
import { applyEditsToMarkdown, type NoteEdit } from "./note-review";
import { fileHasReviewTag, listReviewFiles } from "./notes";
import { verifyNote, type GeneratedQuestion } from "./openai";
import { applyGrade, todayString } from "./scheduler";
import { SuperTutorSettingTab } from "./settings";
import { createId, ReviewStore } from "./store";
import type { CardState, Grade } from "./types";
import { NoteReviewModal } from "./ui/note-review-modal";
import { ReviewView, VIEW_TYPE_REVIEW } from "./ui/review-view";

export default class SuperTutorPlugin extends Plugin {
	store!: ReviewStore;
	private refreshListeners = new Set<() => void>();
	private activeNote: TFile | null = null;
	private unloaded = false;
	private verifying = false;
	private persistQueue: Promise<void> = Promise.resolve();

	async onload(): Promise<void> {
		this.store = ReviewStore.fromLoaded(await this.loadData());

		this.registerView(VIEW_TYPE_REVIEW, (leaf) => new ReviewView(leaf, this));
		this.addRibbonIcon("graduation-cap", "Open review", () => {
			void this.activateReviewView();
		});
		this.addCommand({
			id: "open-review",
			name: "Open review",
			callback: () => {
				void this.activateReviewView();
			},
		});
		this.addCommand({
			id: "verify-note",
			name: "Check and improve note with ChatGPT",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") {
					return false;
				}
				if (!checking) {
					void this.reviewNote(file);
				}
				return true;
			},
		});
		this.addSettingTab(new SuperTutorSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.onRename(file, oldPath);
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.onDelete(file);
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				void this.onMetadataChanged(file);
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("resolved", () => {
				void this.syncReviewCards();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (!file || file === this.activeNote) {
					return;
				}
				this.activeNote = file;
				this.refreshViews();
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			this.activeNote = this.app.workspace.getActiveFile();
			void this.syncReviewCards();
		});
	}

	onunload(): void {
		this.unloaded = true;
		document.querySelectorAll(".super-tutor-reviewing").forEach((element) => {
			element.classList.remove("super-tutor-reviewing");
		});
	}

	addRefreshListener(listener: () => void): () => void {
		this.refreshListeners.add(listener);
		return () => {
			this.refreshListeners.delete(listener);
		};
	}

	refreshViews(): void {
		for (const listener of this.refreshListeners) {
			listener();
		}
	}

	async persist(): Promise<void> {
		const pending = this.persistQueue.then(async () => {
			if (this.unloaded) {
				return;
			}
			await this.saveData(this.store.data);
		});
		this.persistQueue = pending.then(
			() => undefined,
			() => undefined,
		);
		await pending;
	}

	getActiveNote(): TFile | null {
		return this.activeNote;
	}

	setActiveNote(file: TFile): void {
		if (file === this.activeNote) {
			return;
		}
		this.activeNote = file;
		this.refreshViews();
	}

	listTaggedCards(): Array<{ file: TFile; card: CardState }> {
		const today = todayString();
		let created = false;
		const entries: Array<{ file: TFile; card: CardState }> = [];
		for (const file of listReviewFiles(this.app)) {
			if (!this.store.getCard(file.path)) {
				created = true;
			}
			entries.push({ file, card: this.store.ensureCard(file.path, today) });
		}
		if (created) {
			void this.persist();
		}
		return entries;
	}

	async activateReviewView(): Promise<void> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_REVIEW)[0];
		if (!leaf) {
			const right = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true);
			if (!right) {
				new Notice("Could not open the review sidebar.");
				return;
			}
			await right.setViewState({ type: VIEW_TYPE_REVIEW, active: true });
			leaf = right;
		}
		await workspace.revealLeaf(leaf);
	}

	async addQuestion(path: string, prompt: string, answer: string): Promise<void> {
		const card = this.store.ensureCard(path);
		card.questions.push({ id: createId(), prompt, answer });
		await this.persist();
		this.refreshViews();
	}

	async updateQuestion(path: string, id: string, prompt: string, answer: string): Promise<void> {
		const card = this.store.getCard(path);
		const question = card?.questions.find((item) => item.id === id);
		if (!question) {
			return;
		}
		question.prompt = prompt;
		question.answer = answer;
		await this.persist();
		this.refreshViews();
	}

	async deleteQuestion(path: string, id: string): Promise<void> {
		const card = this.store.getCard(path);
		if (!card) {
			return;
		}
		card.questions = card.questions.filter((item) => item.id !== id);
		await this.persist();
		this.refreshViews();
	}

	async appendQuestions(path: string, questions: readonly GeneratedQuestion[]): Promise<void> {
		const card = this.store.ensureCard(path);
		for (const question of questions) {
			card.questions.push({
				id: createId(),
				prompt: question.prompt,
				answer: question.answer,
			});
		}
		await this.persist();
		this.refreshViews();
	}

	isVerifying(): boolean {
		return this.verifying;
	}

	async reviewNote(file: TFile): Promise<void> {
		if (this.verifying) {
			return;
		}
		this.verifying = true;
		this.refreshViews();
		try {
			const review = await verifyNote(this, file);
			if (!review || this.unloaded) {
				return;
			}
			new NoteReviewModal(this.app, review, file.path, (edits) => {
				void this.applyNoteEdits(file, edits);
			}).open();
		} finally {
			this.verifying = false;
			if (!this.unloaded) {
				this.refreshViews();
			}
		}
	}

	async applyNoteEdits(file: TFile, edits: readonly NoteEdit[]): Promise<void> {
		if (edits.length === 0) {
			return;
		}
		let applied = 0;
		let missed = 0;
		try {
			await this.app.vault.process(file, (data) => {
				const result = applyEditsToMarkdown(data, edits);
				applied = result.applied;
				missed = result.missed;
				return result.markdown;
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not update the note.";
			new Notice(`Could not apply edits. ${message}`);
			return;
		}
		if (applied === 0) {
			new Notice(
				missed > 0 ? "None of the accepted edits matched the note. Nothing was changed." : "Nothing to change.",
			);
			return;
		}
		const appliedLabel = `Applied ${applied} edit${applied === 1 ? "" : "s"}.`;
		const missedLabel =
			missed > 0 ? ` ${missed} did not match the note and ${missed === 1 ? "was" : "were"} skipped.` : "";
		new Notice(`${appliedLabel}${missedLabel}`);
	}

	async gradeNote(path: string, grade: Grade): Promise<void> {
		const card = this.store.getCard(path);
		if (!card || card.questions.length === 0) {
			return;
		}
		const next = applyGrade(card, grade, todayString());
		card.ease = next.ease;
		card.intervalDays = next.intervalDays;
		card.repetitions = next.repetitions;
		card.due = next.due;
		await this.persist();
		this.refreshViews();
	}

	async resetAllSchedules(): Promise<void> {
		const paths = listReviewFiles(this.app).map((file) => file.path);
		this.store.resetSchedules(paths, todayString());
		await this.persist();
		this.refreshViews();
	}

	private async syncReviewCards(): Promise<void> {
		if (this.unloaded) {
			return;
		}
		const today = todayString();
		let changed = false;
		for (const file of listReviewFiles(this.app)) {
			if (!this.store.getCard(file.path)) {
				this.store.ensureCard(file.path, today);
				changed = true;
			}
		}
		if (changed) {
			await this.persist();
		}
		this.refreshViews();
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		if (!this.store.movePath(oldPath, file.path)) {
			return;
		}
		void this.persist().then(() => this.refreshViews());
	}

	private onDelete(file: TAbstractFile): void {
		if (!this.store.deletePath(file.path)) {
			return;
		}
		void this.persist().then(() => this.refreshViews());
	}

	private async onMetadataChanged(file: TAbstractFile): Promise<void> {
		if (file instanceof TFile && file.extension === "md" && fileHasReviewTag(this.app, file) && !this.store.getCard(file.path)) {
			this.store.ensureCard(file.path, todayString());
			await this.persist();
		}
		this.refreshViews();
	}
}
