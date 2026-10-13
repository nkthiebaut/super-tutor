import { App, Component, MarkdownRenderer, Modal } from "obsidian";
import type { GeneratedQuestion } from "../openai";

export class GeneratedQuestionsModal extends Modal {
	private renderer = new Component();

	constructor(
		app: App,
		private questions: readonly GeneratedQuestion[],
		private sourcePath: string,
		private onAccept: (questions: readonly GeneratedQuestion[]) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.renderer.load();
		contentEl.addClass("super-tutor-generated-modal");
		this.titleEl.setText("Validate generated answers");
		contentEl.createEl("p", {
			cls: "super-tutor-muted",
			text: "Review the questions and reference answers before adding them to this note.",
		});

		const accepted = new Set(this.questions.map((_, index) => index));

		for (const [index, question] of this.questions.entries()) {
			const item = contentEl.createDiv({ cls: "super-tutor-generated-question" });
			item.createEl("strong", { text: `Question ${index + 1}` });
			const prompt = item.createDiv({ cls: "super-tutor-prompt" });
			void MarkdownRenderer.render(this.app, question.prompt, prompt, this.sourcePath, this.renderer);
			item.createEl("strong", { text: "Reference answer" });
			const answer = item.createDiv({ cls: "super-tutor-generated-answer" });
			void MarkdownRenderer.render(this.app, question.answer, answer, this.sourcePath, this.renderer);
			const decision = item.createEl("button", { text: "Reject" });
			decision.addEventListener("click", () => {
				if (accepted.has(index)) {
					accepted.delete(index);
					decision.setText("Accept");
					item.addClass("is-rejected");
				} else {
					accepted.add(index);
					decision.setText("Reject");
					item.removeClass("is-rejected");
				}
				updateAddButton();
			});
		}

		const row = contentEl.createDiv({ cls: "super-tutor-buttons" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const add = row.createEl("button");
		add.addClass("mod-cta");
		const updateAddButton = (): void => {
			add.setText(`Add accepted (${accepted.size})`);
			add.disabled = accepted.size === 0;
		};
		updateAddButton();
		add.addEventListener("click", () => {
			this.onAccept(this.questions.filter((_, index) => accepted.has(index)));
			this.close();
		});
	}

	onClose(): void {
		this.renderer.unload();
		this.contentEl.empty();
	}
}
