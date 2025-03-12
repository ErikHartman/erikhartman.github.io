# Research Methodology Flash Cards

This is a simple web application that turns the quiz questions from the Introduction to Research Methodology course into interactive flash cards.

## Features

- Interactive flash cards with questions and answers
- Filter cards by topic (different days)
- Navigate through cards with previous/next buttons
- Flip cards to see the correct answer
- Shuffle cards for randomized practice
- Automatic loading of questions from course Markdown files

## How to Use

### Running via a Local Web Server (Recommended)

To enable automatic loading of all quiz questions from the Markdown files:

1. Set up a local web server:
   - Using Python: `python -m http.server` (Python 3) or `python -m SimpleHTTPServer` (Python 2)
   - Using VS Code: Install the "Live Server" extension and right-click on index.html to open with Live Server
   - Using npm: Install `http-server` globally with `npm install -g http-server` then run `http-server`
2. Open the application in your browser via the local server (e.g., http://localhost:8000)

### Running by Opening the HTML File Directly

If you just open the HTML file directly in your browser, the app will use built-in questions (a limited subset) instead of loading them from the Markdown files.

## Using the Flash Cards

1. Use the "Flip to See Answer" button to reveal the correct answer
2. Navigate through cards using the "Previous" and "Next" buttons
3. Filter cards by topic using the dropdown menu
4. Shuffle cards for random practice

## Structure

- `index.html` - Main HTML structure
- `styles.css` - Styling for the flash cards and layout
- `quiz-parser.js` - Parser for extracting quiz questions from Markdown files
- `flashcards.js` - Main application logic and fallback questions

## Technical Notes

- The application attempts to load questions directly from Markdown files when running via a web server
- If fetching the Markdown files fails (e.g., when opening the file directly), it falls back to built-in questions
- The quiz parser extracts questions, options, and identifies correct answers from the Markdown format
