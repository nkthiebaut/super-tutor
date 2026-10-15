import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import type { GeneratedQuestion } from "../openai";
import { QuestionModal } from "./question-modal";

export class GeneratedQuestionsModal extends Modal {
	private renderer = new Component();
	private readonly questions: GeneratedQuestion[];
	private readonly accepted = new Set<number>();

	constructor(
		app: App,
		questions: readonly GeneratedQuestion[],
		private sourcePath: string,
		private onAccept: (questions: readonly GeneratedQuestion[]) => void,
	) {
		super(app);
		this.questions = questions.map((question) => ({ ...question }));
		for (let index = 0; index < this.questions.length; index += 1) {
			this.accepted.add(index);
		}
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.renderer.unload();
		this.contentEl.empty();
	}

	private render(): void {
		this.renderer.unload();
		this.renderer = new Component();
		this.renderer.load();
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("super-tutor-generated-modal");
		this.titleEl.setText("Validate generated answers");
		contentEl.createEl("p", {
			cls: "super-tutor-muted",
			text: "Edit any question or reference answer, then add the ones you accept.",
		});

		for (const [index, question] of this.questions.entries()) {
			const item = contentEl.createDiv({ cls: "super-tutor-generated-question" });
			if (!this.accepted.has(index)) {
				item.addClass("is-rejected");
			}
			item.createEl("strong", { text: `Question ${index + 1}` });
			const prompt = item.createDiv({ cls: "super-tutor-prompt" });
			void MarkdownRenderer.render(this.app, question.prompt, prompt, this.sourcePath, this.renderer);
			item.createEl("strong", { text: "Reference answer" });
			const answer = item.createDiv({ cls: "super-tutor-generated-answer" });
			void MarkdownRenderer.render(this.app, question.answer, answer, this.sourcePath, this.renderer);

			const actions = item.createDiv({ cls: "super-tutor-actions" });
			const edit = actions.createEl("button", { text: "Edit" });
			edit.addEventListener("click", () => {
				new QuestionModal(this.app, "Edit generated question", question, (draft) => {
					this.questions[index] = draft;
					this.render();
				}).open();
			});
			const decision = actions.createEl("button", { text: this.accepted.has(index) ? "Reject" : "Accept" });
			decision.addEventListener("click", () => {
				if (this.accepted.has(index)) {
					this.accepted.delete(index);
				} else {
					this.accepted.add(index);
				}
				this.render();
			});
		}

		const row = contentEl.createDiv({ cls: "super-tutor-buttons" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const add = row.createEl("button");
		add.addClass("mod-cta");
		add.setText(`Add accepted (${this.accepted.size})`);
		add.disabled = this.accepted.size === 0;
		add.addEventListener("click", () => {
			this.onAccept(this.questions.filter((_, index) => this.accepted.has(index)));
			this.close();
		});
	}
}
