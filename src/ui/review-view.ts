import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf, type App, type TFile } from "obsidian";
import type SuperTutorPlugin from "../main";
import { fileHasReviewTag } from "../notes";
import { generateQuestions } from "../openai";
import { dueLabel, isDue, todayString } from "../scheduler";
import type { CardState } from "../types";
import { GeneratedQuestionsModal } from "./generated-questions-modal";
import { QuestionModal } from "./question-modal";
import { ReviewModal } from "./review-modal";

export const VIEW_TYPE_REVIEW = "super-tutor-review";

export class ReviewView extends ItemView {
	private removeRefresh: (() => void) | null = null;
	private generating = false;
	private questionsExpanded = true;
	private dueExpanded = true;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: SuperTutorPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_REVIEW;
	}

	getDisplayText(): string {
		return "Review";
	}

	getIcon(): "graduation-cap" {
		return "graduation-cap";
	}

	async onOpen(): Promise<void> {
		this.removeRefresh = this.plugin.addRefreshListener(() => this.render());
		this.render();
	}

	async onClose(): Promise<void> {
		this.removeRefresh?.();
		this.removeRefresh = null;
	}

	private render(): void {
		const container = this.contentEl;
		const scrollTop = container.scrollTop;
		container.empty();
		container.addClass("super-tutor-review");
		this.renderCurrentNote(container);
		container.createDiv({ cls: "super-tutor-separator" });
		this.renderDue(container);
		container.scrollTop = scrollTop;
	}

	private renderDue(container: HTMLElement): void {
		const today = todayString();
		const tagged = this.plugin.listTaggedCards();
		const due = tagged
			.filter((entry) => isDue(entry.card.due, today))
			.sort((a, b) => a.card.due.localeCompare(b.card.due) || a.file.basename.localeCompare(b.file.basename));

		const title = due.length > 0 ? `Due notes (${due.length})` : "Due notes";
		const section = this.section(container, title, this.dueExpanded, (open) => {
			this.dueExpanded = open;
		});

		if (tagged.length === 0) {
			section.createEl("p", { cls: "super-tutor-muted", text: "No notes are tagged #review." });
			return;
		}
		if (due.length === 0) {
			const next = tagged
				.map((entry) => entry.card.due)
				.filter((date) => date > today)
				.sort()[0];
			const message = next ? `Nothing due. Next review is ${next}.` : "Nothing due.";
			section.createEl("p", { cls: "super-tutor-muted", text: message });
			return;
		}

		for (const entry of due) {
			const button = section.createEl("button", { cls: "super-tutor-due-button" });
			button.title = entry.file.path;
			button.createSpan({ cls: "super-tutor-due-title", text: entry.file.basename });
			const status = dueStatus(entry.card, today);
			button.createSpan({ cls: "super-tutor-muted", text: status });
			button.addEventListener("click", () => {
				void this.openReview(entry.file);
			});
		}
	}

	private renderCurrentNote(container: HTMLElement): void {
		const section = this.section(container, "Questions", this.questionsExpanded, (open) => {
			this.questionsExpanded = open;
		});
		const file = this.plugin.getActiveNote();
		if (!file || !fileHasReviewTag(this.app, file)) {
			section.createEl("p", {
				cls: "super-tutor-muted",
				text: "Open a note tagged #review to edit its questions.",
			});
			return;
		}

		const card = this.plugin.store.getCard(file.path);
		const questions = card?.questions ?? [];
		if (questions.length === 0) {
			section.createEl("p", { cls: "super-tutor-muted", text: "No questions yet." });
		}

		for (const question of questions) {
			const row = section.createDiv({ cls: "super-tutor-question" });
			const prompt = row.createDiv({ cls: "super-tutor-question-prompt" });
			void MarkdownRenderer.render(this.app, question.prompt, prompt, file.path, this);
			const actions = row.createDiv({ cls: "super-tutor-actions" });
			const edit = actions.createEl("button", { text: "Edit" });
			edit.addEventListener("click", () => {
				new QuestionModal(this.app, "Edit question", question, (draft) => {
					void this.plugin.updateQuestion(file.path, question.id, draft.prompt, draft.answer);
				}).open();
			});
			const remove = actions.createEl("button", { text: "Delete" });
			remove.addEventListener("click", () => {
				void this.plugin.deleteQuestion(file.path, question.id);
			});
		}

		const actions = section.createDiv({ cls: "super-tutor-actions" });
		const add = actions.createEl("button", { text: "Add question" });
		add.addEventListener("click", () => {
			new QuestionModal(this.app, "Add question", { prompt: "", answer: "" }, (draft) => {
				void this.plugin.addQuestion(file.path, draft.prompt, draft.answer);
			}).open();
		});

		const busy = this.generating || this.plugin.isVerifying();
		const hasKey = this.plugin.store.data.settings.openaiApiKey.trim().length > 0;
		const generate = actions.createEl("button", {
			text: this.generating ? "Generating…" : "Generate with ChatGPT",
		});
		generate.disabled = busy || !hasKey;
		generate.addEventListener("click", () => {
			void this.generate(file);
		});

		const verify = actions.createEl("button", {
			text: this.plugin.isVerifying() ? "Checking…" : "Check & improve with ChatGPT",
		});
		verify.disabled = busy || !hasKey;
		verify.addEventListener("click", () => {
			void this.plugin.reviewNote(file);
		});
		if (!hasKey) {
			section.createEl("p", {
				cls: "super-tutor-muted",
				text: "Add an OpenAI API key in settings to generate questions and verify notes.",
			});
		}
	}

	private section(container: HTMLElement, title: string, expanded: boolean, onToggle: (open: boolean) => void): HTMLElement {
		const section = container.createEl("details", { cls: "super-tutor-section" });
		section.open = expanded;
		const summary = section.createEl("summary", { cls: "super-tutor-section-summary" });
		summary.createEl("h4", { text: title });
		section.addEventListener("toggle", () => {
			onToggle(section.open);
		});
		return section.createDiv({ cls: "super-tutor-section-body" });
	}

	private async openReview(file: TFile): Promise<void> {
		const recent = this.app.workspace.getMostRecentLeaf();
		const leaf = recent && recent.view.getViewType() !== VIEW_TYPE_REVIEW ? recent : this.app.workspace.getLeaf(true);
		await leaf.openFile(file);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		this.plugin.setActiveNote(file);
		revealInFileExplorer(this.app);
		new ReviewModal(this.app, this.plugin, file).open();
	}

	private async generate(file: TFile): Promise<void> {
		if (this.generating) {
			return;
		}
		this.generating = true;
		this.render();
		try {
			const questions = await generateQuestions(this.plugin, file);
			if (questions) {
				new GeneratedQuestionsModal(this.app, questions, file.path, (accepted) => {
					void this.plugin.appendQuestions(file.path, accepted).then(() => {
						new Notice(`Added ${accepted.length} question${accepted.length === 1 ? "" : "s"}.`);
					});
				}).open();
			}
		} finally {
			this.generating = false;
			this.render();
		}
	}
}

// `commands` is not part of Obsidian's public typings.
function revealInFileExplorer(app: App): void {
	const { commands } = app as App & { commands?: { executeCommandById(id: string): boolean } };
	commands?.executeCommandById("file-explorer:reveal-active-file");
}

function dueStatus(card: CardState, today: string): string {
	if (card.questions.length === 0) {
		return `${dueLabel(card.due, today)} · no questions`;
	}
	return dueLabel(card.due, today);
}
