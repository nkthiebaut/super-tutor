import { Component, MarkdownRenderer, Modal, type App } from "obsidian";
import { noteEditCategoryLabel, type NoteEdit, type NoteReview } from "../note-review";

export class NoteReviewModal extends Modal {
	private renderer = new Component();
	private readonly accepted = new Set<number>();

	constructor(
		app: App,
		private review: NoteReview,
		private sourcePath: string,
		private onAccept: (edits: readonly NoteEdit[]) => void,
	) {
		super(app);
		for (let index = 0; index < review.edits.length; index += 1) {
			this.accepted.add(index);
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		this.renderer.load();
		this.modalEl.addClass("super-tutor-note-review-dialog");
		contentEl.addClass("super-tutor-note-review-modal");
		this.titleEl.setText("Check and improve this note");
		contentEl.createEl("p", { text: this.review.assessment });

		if (this.review.edits.length === 0) {
			const row = contentEl.createDiv({ cls: "super-tutor-buttons" });
			const close = row.createEl("button", { text: "Close" });
			close.addClass("mod-cta");
			close.addEventListener("click", () => this.close());
			return;
		}

		contentEl.createEl("p", {
			cls: "super-tutor-muted",
			text: "Accept or reject each correction, improvement, or addition. Only accepted changes are written into the note.",
		});

		for (const [index, edit] of this.review.edits.entries()) {
			const item = contentEl.createDiv({ cls: "super-tutor-generated-question" });
			const heading = item.createDiv({ cls: "super-tutor-edit-heading" });
			heading.createEl("strong", { text: `Edit ${index + 1}` });
			heading.createSpan({ cls: "super-tutor-edit-category", text: noteEditCategoryLabel(edit.category) });
			if (edit.reason) {
				item.createEl("p", { cls: "super-tutor-muted", text: edit.reason });
			}

			const current = item.createDiv({ cls: "super-tutor-edit-current" });
			current.createDiv({ cls: "super-tutor-muted", text: "Current" });
			const original = current.createDiv();
			void MarkdownRenderer.render(this.app, edit.original, original, this.sourcePath, this.renderer);

			const proposed = item.createDiv({ cls: "super-tutor-edit-proposed" });
			proposed.createDiv({ cls: "super-tutor-muted", text: "Proposed" });
			if (edit.replacement.length > 0) {
				const replacement = proposed.createDiv();
				void MarkdownRenderer.render(this.app, edit.replacement, replacement, this.sourcePath, this.renderer);
			} else {
				proposed.createDiv({ cls: "super-tutor-muted", text: "Delete this passage." });
			}

			const decision = item.createEl("button", { text: "Reject" });
			decision.addEventListener("click", () => {
				if (this.accepted.has(index)) {
					this.accepted.delete(index);
					decision.setText("Accept");
					item.addClass("is-rejected");
				} else {
					this.accepted.add(index);
					decision.setText("Reject");
					item.removeClass("is-rejected");
				}
				updateApplyButton();
			});
		}

		const row = contentEl.createDiv({ cls: "super-tutor-buttons" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const apply = row.createEl("button");
		apply.addClass("mod-cta");
		const updateApplyButton = (): void => {
			apply.setText(`Apply accepted (${this.accepted.size})`);
			apply.disabled = this.accepted.size === 0;
		};
		updateApplyButton();
		apply.addEventListener("click", () => {
			this.onAccept(this.review.edits.filter((_, index) => this.accepted.has(index)));
			this.close();
		});
	}

	onClose(): void {
		this.renderer.unload();
		this.contentEl.empty();
	}
}
