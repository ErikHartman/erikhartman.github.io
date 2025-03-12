document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const flashcard = document.getElementById('current-card');
    const questionText = document.getElementById('question-text');
    const frontOptions = document.getElementById('front-options');
    const answerOptions = document.getElementById('answer-options');
    const flipBtn = document.getElementById('flip-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const topicFilter = document.getElementById('topic-filter');
    const cardCounter = document.getElementById('card-counter');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    // Flash cards data
    let allCards = [];
    let currentCards = [];
    let currentCardIndex = 0;
    
    // Fallback quiz data for direct file opening (without server)
    const fallbackQuizData = [
        // Day 2: Epidemiology and Causality
        {
            id: 1,
            topic: 'day2',
            question: 'You are about to start a new study and want to minimize bias. Which three types of bias exist?',
            options: [
                { text: 'Information bias, Selection bias and Confounding', isCorrect: true },
                { text: 'Immortal time bias, Random error and Confounding', isCorrect: false },
                { text: 'Confounding, Residual confounding, Causal complements', isCorrect: false },
                { text: 'Selection bias, competing risks and Information bias', isCorrect: false }
            ]
        },
        // More fallback questions...
    ];
    
    // File paths to fetch - fixed the typo in path
    const quizFiles = [
        './all_quizzes.md'
    ];
    
    // Initialize flash cards
    function initFlashcards() {
        // Show loading indicator first
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
        }
        
        // Try to fetch markdown files first
        loadQuizFilesSequentially(quizFiles)
            .then(cards => {
                if (cards.length > 0) {
                    allCards = cards;
                    console.log(`Loaded ${allCards.length} cards from markdown files`);
                } else {
                    // Fall back to built-in data if fetching fails
                    allCards = [...fallbackQuizData];
                    console.log(`Using fallback data with ${allCards.length} cards`);
                }
                currentCards = [...allCards];
                updateCardDisplay();
                updateCardCounter();
                
                // Hide loading indicator
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
            })
            .catch(error => {
                console.error("Error loading quiz files:", error);
                // Fall back to built-in data
                allCards = [...fallbackQuizData];
                currentCards = [...allCards];
                updateCardDisplay();
                updateCardCounter();
                
                // Hide loading indicator
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
            });
    }
    
    // Sequentially load quiz files to avoid overwhelming the browser
    async function loadQuizFilesSequentially(filePaths) {
        let allQuizCards = [];
        
        for (const filePath of filePaths) {
            try {
                const response = await fetch(filePath);
                if (!response.ok) {
                    console.warn(`Failed to fetch ${filePath}: ${response.statusText}`);
                    continue;
                }
                
                const markdown = await response.text();
                console.log(`Successfully fetched ${filePath}, content length: ${markdown.length} characters`);
                console.log(`First 100 characters: ${markdown.substring(0, 100)}...`);
                
                // Extract day from filename if possible
                const dayMatch = filePath.match(/day(\d+)\.md$/i);
                const defaultTopic = dayMatch ? `day${dayMatch[1]}` : 'unknown';
                
                // Extract cards using the parser
                try {
                    const cards = QuizParser.parseMarkdown(markdown);
                    console.log(`Parsed ${cards.length} cards from ${filePath}`);
                    
                    // If we have cards but no topics, set default
                    if (cards.length > 0) {
                        cards.forEach(card => {
                            if (card.topic === 'unknown') card.topic = defaultTopic;
                        });
                        allQuizCards = allQuizCards.concat(cards);
                    } else {
                        console.warn(`No cards were parsed from ${filePath}`);
                        // Last resort - try manual parsing with regex
                        const backupCards = manuallyParseMarkdown(markdown, defaultTopic);
                        if (backupCards.length > 0) {
                            console.log(`Manual parsing found ${backupCards.length} cards`);
                            allQuizCards = allQuizCards.concat(backupCards);
                        }
                    }
                } catch (parseError) {
                    console.error(`Error parsing markdown from ${filePath}:`, parseError);
                }
            } catch (error) {
                console.error(`Error processing ${filePath}:`, error);
            }
        }
        
        return allQuizCards;
    }
    
    // Backup parser as last resort
    function manuallyParseMarkdown(markdown, defaultTopic) {
        const cards = [];
        let id = 1;
        
        // Match question blocks with options
        const questionBlocks = markdown.split(/#{1,3}\s*Question\s*\d+/);
        
        // Skip first entry which is usually a header
        for (let i = 1; i < questionBlocks.length; i++) {
            const block = questionBlocks[i];
            
            try {

                
                // Extract question text - usually the second paragraph
                const lines = block.split('\n').filter(line => line.trim());
                const questionText = lines.length > 1 ? lines[1].trim() : "";
                
                // Find option lines (starting with -)
                const optionLines = [];
                let correctIndex = -1;
                
                for (let j = 0; j < lines.length; j++) {
                    const line = lines[j];
                    if (line.trim().startsWith('- ')) {
                        optionLines.push(line.trim().substring(2));
                        // Look for markers of correct answer
                        if (line.includes('**') || line.includes('[x]')) {
                            correctIndex = optionLines.length - 1;
                        }
                    }
                }
                
                // Create options array
                const options = optionLines.map((text, index) => ({
                    text: text.replace(/\[\s*\]/g, '').replace(/\[x\]/g, '').replace(/\*\*/g, '').trim(),
                    isCorrect: index === correctIndex
                }));
                
                // Add card if we have options
                if (options.length > 0) {
                    cards.push({
                        id: id++,
                        topic: defaultTopic,
                        question: questionText,
                        options: options
                    });
                }
            } catch (error) {
                console.error("Error in manual parsing:", error);
            }
        }
        
        return cards;
    }
    
    // Update the card counter display
    function updateCardCounter() {
        cardCounter.textContent = `Card ${currentCardIndex + 1} of ${currentCards.length}`;
        
        // Update button states
        prevBtn.disabled = currentCardIndex === 0;
        nextBtn.disabled = currentCardIndex === currentCards.length - 1;
    }
    
    // Display current card
    function updateCardDisplay() {
        if (currentCards.length === 0) {
            questionText.textContent = '';
            frontOptions.innerHTML = '';
            answerOptions.innerHTML = '';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }
        
        const card = currentCards[currentCardIndex];
        
        questionText.textContent = card.question;
        
        // Clear previous options
        frontOptions.innerHTML = '';
        answerOptions.innerHTML = '';
        
        // Add options to front side (without highlighting the correct one)
        card.options.forEach((option, index) => {
            const optionElement = document.createElement('div');
            optionElement.classList.add('option');
            optionElement.textContent = `${String.fromCharCode(65 + index)}. ${option.text}`;
            frontOptions.appendChild(optionElement);
        });
        
        // Add options to back side (with the correct one highlighted)
        card.options.forEach((option, index) => {
            const optionElement = document.createElement('div');
            optionElement.classList.add('option');
            if (option.isCorrect) {
                optionElement.classList.add('correct');
            }
            optionElement.textContent = `${String.fromCharCode(65 + index)}. ${option.text}`;
            answerOptions.appendChild(optionElement);
        });
        
        // Reset card to front side
        if (flashcard.classList.contains('flipped')) {
            flashcard.classList.remove('flipped');
        }
    }
    
    // Filter cards by topic
    function filterCardsByTopic(topic) {
        if (topic === 'all') {
            currentCards = [...allCards];
        } else {
            currentCards = allCards.filter(card => card.topic === topic);
        }
        
        currentCardIndex = 0;
        updateCardDisplay();
        updateCardCounter();
    }
    
    // Shuffle the cards
    function shuffleCards() {
        for (let i = currentCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [currentCards[i], currentCards[j]] = [currentCards[j], currentCards[i]];
        }
        currentCardIndex = 0;
        updateCardDisplay();
        updateCardCounter();
    }
    
    // Event listeners
    flipBtn.addEventListener('click', function() {
        flashcard.classList.toggle('flipped');
    });
    
    prevBtn.addEventListener('click', function() {
        if (currentCardIndex > 0) {
            currentCardIndex--;
            updateCardDisplay();
            updateCardCounter();
        }
    });
    
    nextBtn.addEventListener('click', function() {
        if (currentCardIndex < currentCards.length - 1) {
            currentCardIndex++;
            updateCardDisplay();
            updateCardCounter();
        }
    });
    
    shuffleBtn.addEventListener('click', shuffleCards);
    
    topicFilter.addEventListener('change', function() {
        filterCardsByTopic(this.value);
    });
    
    // Initialize
    initFlashcards();
});
