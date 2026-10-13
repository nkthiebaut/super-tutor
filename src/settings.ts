import { App, Modal, Notice, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
import type SuperTutorPlugin from "./main";
import { DEFAULT_MODEL } from "./types";

export class SuperTutorSettingTab extends PluginSettingTab {
	plugin: SuperTutorPlugin;

	constructor(app: App, plugin: SuperTutorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Review notes",
				desc: "Notes tagged #review are scheduled with SM-2. Questions and due dates stay in plugin data, not in the note.",
			},
			{
				type: "group",
				heading: "ChatGPT",
				items: [
					{
						name: "OpenAI API key",
						desc: "Stored locally in this vault’s plugin data and used only to generate questions.",
						render: (setting) => {
							setting.addText((text) => {
								text.inputEl.type = "password";
								text.setPlaceholder("sk-...")
									.setValue(this.plugin.store.data.settings.openaiApiKey)
									.onChange(async (value) => {
										this.plugin.store.data.settings.openaiApiKey = value.trim();
										await this.plugin.persist();
										this.plugin.refreshViews();
									});
							});
						},
					},
					{
						name: "Model",
						desc: `${DEFAULT_MODEL} is the default Chat Completions model.`,
						render: (setting) => {
							setting.addText((text) => {
								text.setPlaceholder(DEFAULT_MODEL)
									.setValue(this.plugin.store.data.settings.model)
									.onChange(async (value) => {
										const model = value.trim() || DEFAULT_MODEL;
										this.plugin.store.data.settings.model = model;
										if (!value.trim()) {
											text.setValue(model);
										}
										await this.plugin.persist();
									});
							});
						},
					},
				],
			},
			{
				type: "group",
				heading: "Schedule",
				items: [
					{
						name: "Reset all review schedules",
						desc: "Sets every note currently tagged #review back to new: due today, ease 2.5, and no review history. Questions are kept.",
						action: () => {
							this.confirmReset();
						},
					},
				],
			},
		];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("p", {
			cls: "super-tutor-muted",
			text: "Notes tagged #review are scheduled with SM-2. Questions and due dates stay in plugin data, not in the note.",
		});

		new Setting(containerEl).setName("ChatGPT").setHeading();

		new Setting(containerEl)
			.setName("OpenAI API key")
			.setDesc("Stored locally in this vault’s plugin data and used only to generate questions.")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("sk-...")
					.setValue(this.plugin.store.data.settings.openaiApiKey)
					.onChange(async (value) => {
						this.plugin.store.data.settings.openaiApiKey = value.trim();
						await this.plugin.persist();
						this.plugin.refreshViews();
					});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc(`${DEFAULT_MODEL} is the default Chat Completions model.`)
			.addText((text) => {
				text.setPlaceholder(DEFAULT_MODEL)
					.setValue(this.plugin.store.data.settings.model)
					.onChange(async (value) => {
						const model = value.trim() || DEFAULT_MODEL;
						this.plugin.store.data.settings.model = model;
						if (!value.trim()) {
							text.setValue(model);
						}
						await this.plugin.persist();
					});
			});

		new Setting(containerEl).setName("Schedule").setHeading();

		new Setting(containerEl)
			.setName("Reset all review schedules")
			.setDesc("Sets every note currently tagged #review back to new: due today, ease 2.5, and no review history. Questions are kept.")
			.addButton((button) => {
				button.setButtonText("Reset").setWarning().onClick(() => {
					this.confirmReset();
				});
			});
	}

	private confirmReset(): void {
		new ConfirmResetModal(this.app, async () => {
			await this.plugin.resetAllSchedules();
			new Notice("Review schedules reset.");
		}).open();
	}
}

class ConfirmResetModal extends Modal {
	constructor(
		app: App,
		private onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText("Reset review schedules?");
		contentEl.createEl("p", {
			text: "Every note tagged #review goes back to new: due today, ease 2.5, and no review history. Questions are kept.",
		});
		const row = contentEl.createDiv({ cls: "super-tutor-buttons" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const confirm = row.createEl("button", { text: "Reset" });
		confirm.addClass("mod-warning");
		confirm.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
