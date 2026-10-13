# Super Tutor

Obsidian plugin that schedules notes tagged `#review` with SM-2 and reviews each one as a short set of questions. Questions are written by hand or generated with ChatGPT. The note file itself is left unchanged.

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
3. With that note active, add questions or choose **Generate with ChatGPT**. Put an OpenAI API key in the plugin settings first. The default model is `gpt-5`.
4. AI generation creates three questions. Review their questions and reference answers, accept or reject each one, then add the accepted questions.
5. Due notes appear below the active note in the sidebar. Open one to answer its questions, reveal each reference answer, then grade the note Again, Hard, Good, or Easy.
6. The next review date follows SM-2: 1 day, then 6 days, then the interval times the ease factor. Again starts that note over at 1 day.

Questions and reference answers support Obsidian Markdown, including inline LaTeX (`$...$`) and display LaTeX (`$$...$$`).

**Reset all review schedules** in plugin settings sets every note that currently has `#review` back to due today. Questions are kept. Removing the tag hides a note without deleting its schedule; tagging it again continues where it left off.
