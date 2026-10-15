# Super Tutor

Obsidian plugin that schedules notes tagged `#review` with SM-2 and reviews each one as a short set of questions. Questions are written by hand or generated with ChatGPT, and stay in plugin data. ChatGPT can also check a note for factual errors, inconsistencies, unclear writing, and useful missing information, then apply the changes you accept.

## Install

```bash
npm install
npm test
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault:

```text
<vault>/.obsidian/plugins/super-tutor/
```

Reload Obsidian and enable **Super Tutor** in Settings → Community plugins.

For local development, `npm run dev` rebuilds `main.js` as you edit.

## Use

1. Tag a note `#review` (in the body or in frontmatter `tags`).
2. Open the review sidebar from the ribbon icon or the command **Open review**.
3. With that note active, add questions or choose **Generate with ChatGPT**. Put an OpenAI API key in the plugin settings first. The default model is `gpt-5-mini`.
4. AI generation creates three questions. Edit, accept, or reject each question and reference answer, then add the accepted questions.
5. Choose **Check & improve with ChatGPT** to check the open note. It can propose corrections, rewrites, and concise additions such as caveats, examples, definitions, or useful connections. Review each proposed change, then apply the ones you accept. The command **Check and improve note with ChatGPT** does the same for any open Markdown note. The file changes only for changes you apply.
6. The questions for the open note and the due notes sit in collapsible sections, with a divider between them. Due notes appear below. Open one to answer its questions. The note blurs while a question is on screen, then comes back into focus when you grade. Reveal each reference answer, then grade the note Again, Hard, Good, or Easy.
7. The next review date follows SM-2: 1 day, then 6 days, then the interval times the ease factor. Again starts that note over at 1 day.

Questions and reference answers support Obsidian Markdown, including inline LaTeX (`$...$`) and display LaTeX (`$$...$$`).

**Reset all review schedules** in plugin settings sets every note that currently has `#review` back to due today. Questions are kept. Removing the tag hides a note without deleting its schedule; tagging it again continues where it left off.
