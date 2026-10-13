import { getAllTags, type App, type TFile } from "obsidian";
import { REVIEW_TAG } from "./types";

export function fileHasReviewTag(app: App, file: TFile): boolean {
	if (file.extension !== "md") {
		return false;
	}
	const cache = app.metadataCache.getFileCache(file);
	const tags = cache ? (getAllTags(cache) ?? []) : [];
	return tags.some((tag) => tag.toLowerCase() === REVIEW_TAG);
}

export function listReviewFiles(app: App): TFile[] {
	return app.vault.getMarkdownFiles().filter((file) => fileHasReviewTag(app, file));
}
