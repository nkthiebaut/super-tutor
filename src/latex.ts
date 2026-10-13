const JSON_ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);
const CONTROL_ESCAPES: Record<string, string> = {
	"\b": "b",
	"\f": "f",
	"\n": "n",
	"\r": "r",
	"\t": "t",
};

/**
 * Models often write LaTeX inside JSON strings with single backslashes, so `\theta`
 * would decode as a tab followed by "heta". Inside math, a backslash before a letter
 * is always LaTeX; outside math, valid JSON escapes such as `\n` are kept.
 */
export function escapeLatexInJson(json: string): string {
	let result = "";
	let inString = false;
	let inMath = false;
	let index = 0;
	while (index < json.length) {
		const current = json[index] ?? "";
		const next = json[index + 1] ?? "";

		if (!inString) {
			if (current === '"') {
				inString = true;
				inMath = false;
			}
			result += current;
			index += 1;
			continue;
		}

		if (current === '"') {
			inString = false;
			result += current;
			index += 1;
			continue;
		}

		if (current === "$") {
			const delimiter = next === "$" ? "$$" : "$";
			inMath = !inMath;
			result += delimiter;
			index += delimiter.length;
			continue;
		}

		if (current !== "\\") {
			result += current;
			index += 1;
			continue;
		}

		if (next === "(" || next === "[") {
			inMath = true;
		} else if (next === ")" || next === "]") {
			inMath = false;
		}

		const isUnicode = next === "u" && /^[0-9a-fA-F]{4}$/.test(json.slice(index + 2, index + 6));
		if (isUnicode && !inMath) {
			result += json.slice(index, index + 6);
			index += 6;
			continue;
		}

		const isLatexCommand = inMath && /[A-Za-z]/.test(next);
		if (next === "\\" || next === '"' || (JSON_ESCAPES.has(next) && !isLatexCommand)) {
			result += current + next;
		} else {
			result += `\\\\${next}`;
		}
		index += 2;
	}
	return result;
}

export function normalizeLatex(text: string): string {
	return repairControlCharacters(text)
		.replace(/\\\[([\s\S]+?)\\\]/g, (_, math: string) => `$$${math}$$`)
		.replace(/\\\(([\s\S]+?)\\\)/g, (_, math: string) => `$${math}$`);
}

function repairControlCharacters(text: string): string {
	return text.replace(/(\$\$?)([\s\S]+?)\1/g, (_, delimiter: string, math: string) => {
		const repaired = math.replace(/[\b\f\n\r\t](?=[A-Za-z])/g, (char) => `\\${CONTROL_ESCAPES[char] ?? ""}`);
		return `${delimiter}${repaired}${delimiter}`;
	});
}
