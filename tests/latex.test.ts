import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeLatexInJson, normalizeLatex } from "../src/latex";

function parseAnswer(raw: string): string {
	const parsed = JSON.parse(escapeLatexInJson(`{"answer":"${raw}"}`)) as { answer: string };
	return normalizeLatex(parsed.answer);
}

describe("escapeLatexInJson", () => {
	it("keeps single-backslash LaTeX commands inside math", () => {
		assert.equal(parseAnswer(String.raw`$\theta \beta \frac{1}{2} \nabla \rho \text{x}$`), String.raw`$\theta \beta \frac{1}{2} \nabla \rho \text{x}$`);
	});

	it("keeps correctly double-escaped LaTeX", () => {
		assert.equal(parseAnswer(String.raw`$\\log(1+\\exp(x))$`), String.raw`$\log(1+\exp(x))$`);
	});

	it("keeps display math intact", () => {
		assert.equal(parseAnswer(String.raw`$$\frac{a}{b} \odot \tau$$`), String.raw`$$\frac{a}{b} \odot \tau$$`);
	});

	it("keeps JSON newlines, quotes, and unicode outside math", () => {
		assert.equal(parseAnswer(String.raw`Line one\nThe \"next\" caf\u00e9 $\nu$`), 'Line one\nThe "next" café $\\nu$');
	});

	it("converts \\( \\) and \\[ \\] delimiters to dollar signs", () => {
		assert.equal(parseAnswer(String.raw`Inline \(\theta\) and \[\frac{1}{n}\]`), String.raw`Inline $\theta$ and $$\frac{1}{n}$$`);
	});

	it("leaves escaped dollar signs alone", () => {
		assert.equal(parseAnswer(String.raw`It costs \$5`), String.raw`It costs \$5`);
	});
});

describe("normalizeLatex", () => {
	it("repairs saved questions whose LaTeX became control characters", () => {
		assert.equal(normalizeLatex("When $\beta=1$ use $\text{x} \nabla$"), String.raw`When $\beta=1$ use $\text{x} \nabla$`);
	});

	it("does not touch control characters outside math", () => {
		assert.equal(normalizeLatex("a\tb\nc"), "a\tb\nc");
	});
});
