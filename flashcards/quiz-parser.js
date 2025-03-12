/**
 * Parses quiz questions from Markdown content
 */
class QuizParser {
  /**
   * Parse Markdown content into quiz card objects
   * @param {string} markdown - Raw markdown content
   * @return {Array} Array of quiz card objects
   */
  static parseMarkdown(markdown) {
    const cards = [];
    let id = 1;
    
    console.log("Started parsing markdown, length:", markdown.length);
    
    // Try different parsing approaches
    let parsedCards = this.parseQuestionsDirectly(markdown);
    
    if (parsedCards.length === 0) {
      console.log("Direct parsing yielded no results, trying section parsing");
      parsedCards = this.parseSectionsByDay(markdown);
    }
    
    console.log(`Total cards parsed: ${parsedCards.length}`);
    return parsedCards;
  }
  
  /**
   * Parse questions directly from the markdown without section grouping
   */
  static parseQuestionsDirectly(markdown) {
    const cards = [];
    let id = 1;
    
    // Look for question patterns (## Question X, **Question X**, etc.)
    const questionRegex = /(?:##\s*Question\s*(\d+)|##\s*Q(?:uestion)?\s*(\d+)|Question\s*(\d+):|Q(\d+):?|\*\*Question\s*(\d+)\*\*)/g;
    let match;
    let lastIndex = 0;
    
    // Find all question headers
    const questionPositions = [];
    while ((match = questionRegex.exec(markdown)) !== null) {
      questionPositions.push({
        index: match.index,
        number: match[1] || match[2] || match[3] || match[4] || match[5]
      });
    }
    
    console.log(`Found ${questionPositions.length} potential question headers`);
    
    // Process each question block
    for (let i = 0; i < questionPositions.length; i++) {
      const startPos = questionPositions[i].index;
      const endPos = i < questionPositions.length - 1 ? questionPositions[i+1].index : markdown.length;
      const questionBlock = markdown.substring(startPos, endPos);
      
      try {
        // Look for a title in the question block
        const titleMatch = questionBlock.match(/(?:##\s*Question\s*\d+\s*\*\*([^*]+)\*\*|##\s*Question\s*\d+\s*([^\n]+)|##\s*([^\n]+)|Question\s*\d+:?\s*([^\n]+)|\*\*Question\s*\d+\*\*\s*([^\n]+))/);
        let title = titleMatch ? 
                   (titleMatch[1] || titleMatch[2] || titleMatch[3] || titleMatch[4] || titleMatch[5]).trim() : 
                   `Question ${id}`;
        
        // Get the question text - first paragraph after the title 
        let questionText = "";
        const textMatch = questionBlock.match(/(?:##[^\n]+\n|Question[^\n]+\n|\*\*Question[^\n]+\*\*\n)\s*([^\n-][^\n]*)/);
        if (textMatch) {
          questionText = textMatch[1].trim();
        }
        
        // Extract options - match both checkbox and bullet point formats
        const options = [];
        
        // Checkbox format: - [x] option or - [ ] option
        const checkboxRegex = /-\s*\[([ xX])\]\s*([^\n]+)/g;
        let checkboxMatch;
        while ((checkboxMatch = checkboxRegex.exec(questionBlock)) !== null) {
          const isCorrect = checkboxMatch[1].toLowerCase() === 'x';
          const text = checkboxMatch[2].trim();
          options.push({ text, isCorrect });
        }
        
        // Bold correct answer format: - **option** or -**option**
        if (options.length === 0) {
          const boldRegex = /-\s*(?:\*\*([^\*]+)\*\*|([^\n]+))/g;
          let boldMatch;
          while ((boldMatch = boldRegex.exec(questionBlock)) !== null) {
            const boldText = boldMatch[1];
            const normalText = boldMatch[2];
            const text = (boldText || normalText).trim();
            const isCorrect = !!boldText; // If it was in bold, it's correct
            options.push({ text, isCorrect });
          }
        }
        
        // If we have options, create a card
        if (options.length > 0) {
          // Determine the topic (day) from the context
          const dayMatch = questionBlock.match(/Day\s+(\d+)/) || 
                           title.match(/Day\s+(\d+)/) || 
                           { index: -1, 1: "unknown" };
          
          cards.push({
            id: id++,
            topic: `day${dayMatch[1] || "unknown"}`,
            title: title.replace(/^Question\s*\d+[\s:]*/, '').trim(),
            question: questionText,
            options: options
          });
        }
      } catch (e) {
        console.error("Error parsing question block:", e);
        console.log("Problematic block:", questionBlock.substring(0, 100) + "...");
      }
    }
    
    return cards;
  }
  
  /**
   * Parse by day sections first, then questions
   */
  static parseSectionsByDay(markdown) {
    const cards = [];
    let id = 1;
    
    // Split by day headers
    const dayRegex = /(?:##\s*Day\s+(\d+)|Round\s+(\d+))/g;
    let dayMatch;
    const daySections = [];
    let lastIndex = 0;
    
    while ((dayMatch = dayRegex.exec(markdown)) !== null) {
      if (lastIndex < dayMatch.index) {
        daySections.push({
          text: markdown.substring(lastIndex, dayMatch.index),
          day: "unknown"  
        });
      }
      lastIndex = dayMatch.index;
      daySections.push({
        start: dayMatch.index,
        day: dayMatch[1] || dayMatch[2]
      });
    }
    
    // Add the final section
    if (lastIndex < markdown.length) {
      daySections.push({
        text: markdown.substring(lastIndex),
        day: "unknown"
      });
    }
    
    // Process each day section
    for (let i = 0; i < daySections.length - 1; i++) {
      if (!daySections[i].text) {
        daySections[i].text = markdown.substring(
          daySections[i].start,
          daySections[i+1].start
        );
      }
    }
    
    // Now process each section
    daySections.forEach(section => {
      if (!section.text) return;
      
      const topic = `day${section.day}`;
      const sectionCards = this.parseQuestionsInSection(section.text, topic, id);
      id += sectionCards.length;
      cards.push(...sectionCards);
    });
    
    return cards;
  }
  
  /**
   * Parse questions within a section
   */
  static parseQuestionsInSection(text, topic, startId) {
    // Delegate to the direct parsing method but set the topic
    const cards = this.parseQuestionsDirectly(text);
    cards.forEach(card => card.topic = topic);
    return cards;
  }
}

// Make available for use in other scripts
window.QuizParser = QuizParser;
