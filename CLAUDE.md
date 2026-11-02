# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. MUST USE KOREAN

- All communication with the user must be in Korean unless the user explicitly requests another language.
- All progress updates, explanations, questions, feedback, implementation summaries, and final responses must be written in Korean.
- Keep code, API names, library names, error messages, variable names, and other technical identifiers in their original language, but explain them in Korean.


## 6. Project: Nib

- WYSIWYG desktop Markdown editor (Electron + React + TypeScript, editor engine: CodeMirror 6, decided by the user). Read `docs/TECHNICAL_DESIGN.md` and `docs/ROADMAP.md` before implementing; follow the current Phase only.
- Do not introduce a second editor engine (e.g. Tiptap/ProseMirror alongside CodeMirror) without recording the reason in `docs/TECHNICAL_DESIGN.md`.
- Markdown files must not be silently rewritten: any load→save change not made by the user is a bug.
- Renderer never touches `fs` directly; go through the preload bridge.
- Markdown elements share one live-preview rule (user requirement): style an element only once its syntax is complete (e.g. `**x**` has its closing marker, `# ` has the space), and show its markers only while the cursor is strictly inside that element (element-level, never line-level; the element's first/last position does not count, so markers disappear the moment the closing marker is typed — keeping them at the edge leaves them on screen during Korean IME composition because CodeMirror does not redraw next to the composing text). Apply this to every new element.
- When you add or change a feature, shortcut, or input rule, update the in-app help (`src/renderer/helpContent.ts`) in the same change. `npm test` fails if a keyboard shortcut in `commands.ts` or an accelerator in `main/index.ts` is missing from the help.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.