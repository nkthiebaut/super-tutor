import { App, Modal, Notice } from "obsidian";

export interface QuestionDraft {
	prompt: string;
	answer: string;
}

export class QuestionModal extends Modal {
	private prompt = "";
	private answer = "";

	constructor(
		app: App,
		private heading: string,
		initial: QuestionDraft,
		private onSubmit: (value: QuestionDraft) => void,
	) {
		super(app);
		this.prompt = initial.prompt;
		this.answer = initial.answer;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("super-tutor-question-modal");
		this.titleEl.setText(this.heading);

		contentEl.createEl("label", { text: "Question", cls: "super-tutor-muted" });
		const prompt = contentEl.createEl("textarea");
		prompt.value = this.prompt;
		prompt.addEventListener("input", () => {
			this.prompt = prompt.value;
		});

		contentEl.createEl("label", { text: "Reference answer", cls: "super-tutor-muted" });
		const answer = contentEl.createEl("textarea");
		answer.value = this.answer;
		answer.addEventListener("input", () => {
			this.answer = answer.value;
		});

		const row = contentEl.createDiv({ cls: "super-tutor-buttons" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const save = row.createEl("button", { text: "Save" });
		save.addClass("mod-cta");
		save.addEventListener("click", () => {
			const promptText = this.prompt.trim();
			const answerText = this.answer.trim();
			if (!promptText || !answerText) {
				new Notice("Enter both a question and a reference answer.");
				return;
			}
			this.onSubmit({ prompt: promptText, answer: answerText });
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
