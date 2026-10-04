# Research Methodology Flash Cards

Practice questions from the Introduction to Research Methodology course. The app loads `all_quizzes.md` and shuffles the questions and their answer options when the page opens.

## Preview locally

From the website repository root, using Node.js 24 or newer:

```sh
npm ci
npm run build
npm run dev
```

Open [the flashcards](http://localhost:4321/flashcards/). Rebuild and refresh after editing the source files. The flashcards are also included in the site's GitHub Pages deployment.

Opening `index.html` directly, or failing to load the question file, uses one built-in fallback question.

## Controls

- Select an answer to see whether it is correct or wrong. Each selection updates the score once.
- Use **Previous** and **Next** to move between questions. Selections and option order are retained while navigating.
- Reload the page to start a new session with shuffled questions and options. Scores are not saved between sessions.

## Files

- `all_quizzes.md`: question text, answer options, and correct-answer markers.
- `index.html`: page markup and some presentation styles.
- `styles.css`: the remaining page styles.
- `quiz-parser.js`: reads questions and answers from Markdown.
- `flashcards.js`: question loading, fallback parsing and data, shuffling, navigation, and scoring.

The question parser supports checkbox answers and bold correct answers, with fallback parsing for different question layouts.
