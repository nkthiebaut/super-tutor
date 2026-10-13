import { Component, MarkdownRenderer, Modal, Notice, type App, type TFile } from "obsidian";
import type SuperTutorPlugin from "../main";
import { formatInterval, gradeLabel, previewIntervals } from "../scheduler";
import { GRADES, type Grade } from "../types";

export class ReviewModal extends Modal {
	private index = 0;
	private revealed = false;
	private answer = "";
	private renderer = new Component();

	constructor(
		app: App,
		private plugin: SuperTutorPlugin,
		private file: TFile,
	) {
		super(app);
	}

	onOpen(): void {
		this.renderer.load();
		this.contentEl.addClass("super-tutor-review-modal");
		this.render();
	}

	onClose(): void {
		this.renderer.unload();
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText(this.file.basename);

		const card = this.plugin.store.getCard(this.file.path);
		if (!card || card.questions.length === 0) {
			contentEl.createEl("p", {
				text: "This note has no review questions yet. Add one, or generate them with ChatGPT, in the Review sidebar.",
			});
			return;
		}

		if (this.index >= card.questions.length) {
			this.renderGrade(card);
			return;
		}

		const question = card.questions[this.index];
		if (!question) {
			this.renderGrade(card);
			return;
		}

		contentEl.createEl("p", {
			cls: "super-tutor-muted",
			text: `Question ${this.index + 1} of ${card.questions.length}`,
		});
		const prompt = contentEl.createDiv({ cls: "super-tutor-prompt" });
		void MarkdownRenderer.render(this.app, question.prompt, prompt, this.file.path, this.renderer);

		const textarea = contentEl.createEl("textarea", { cls: "super-tutor-answer" });
		textarea.placeholder = "Your answer (optional)";
		textarea.value = this.answer;
		textarea.addEventListener("input", () => {
			this.answer = textarea.value;
		});

		if (this.revealed) {
			const reference = contentEl.createDiv({ cls: "super-tutor-reference" });
			reference.createDiv({ cls: "super-tutor-muted", text: "Reference answer" });
			const answer = reference.createDiv();
			void MarkdownRenderer.render(this.app, question.answer, answer, this.file.path, this.renderer);
		}

		const buttons = contentEl.createDiv({ cls: "super-tutor-buttons" });
		if (!this.revealed) {
			const show = buttons.createEl("button", { text: "Show answer" });
			show.addClass("mod-cta");
			show.addEventListener("click", () => {
				this.revealed = true;
				this.render();
			});
			return;
		}

		const next = buttons.createEl("button", {
			text: this.index === card.questions.length - 1 ? "Grade" : "Next",
		});
		next.addClass("mod-cta");
		next.addEventListener("click", () => {
			this.index += 1;
			this.revealed = false;
			this.answer = "";
			this.render();
		});
	}

	private renderGrade(card: { ease: number; intervalDays: number; repetitions: number }): void {
		const { contentEl } = this;
		contentEl.createEl("p", { text: "How well did you remember this note?" });
		const previews = previewIntervals(card);
		const row = contentEl.createDiv({ cls: "super-tutor-grade-row" });
		for (const grade of GRADES) {
			const interval = previews[grade];
			const button = row.createEl("button", { text: `${gradeLabel(grade)} · ${formatInterval(interval)}` });
			if (grade === "again") {
				button.addClass("mod-warning");
			}
			if (grade === "good") {
				button.addClass("mod-cta");
			}
			button.addEventListener("click", () => {
				void this.chooseGrade(grade, interval);
			});
		}
	}

	private async chooseGrade(grade: Grade, interval: number): Promise<void> {
		await this.plugin.gradeNote(this.file.path, grade);
		new Notice(`Next review in ${formatInterval(interval)}.`);
		this.close();
	}
}
