const fs = require('fs');
const path = require('path');

// Load questions from all JSON files in the data folder + any in Downloads
const sources = [
  './data/all-questions.json',
];

// Also check for flashcards files in Downloads
const downloads = 'C:/Users/devin/Downloads';
try {
  fs.readdirSync(downloads).forEach(f => {
    if (f.startsWith('flashcards') && f.endsWith('.json')) {
      sources.push(path.join(downloads, f));
    }
  });
} catch(e) {}

// Merge all questions, deduplicate
const seen = new Set();
const allQuestions = [];

sources.forEach(src => {
  try {
    const data = JSON.parse(fs.readFileSync(src, 'utf8'));
    console.log('Loaded', data.length, 'from', src);
    data.forEach(q => {
      const norm = q.question.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 80);
      if (!seen.has(norm) && q.question && q.answer && Object.keys(q.options).length >= 2) {
        seen.add(norm);
        allQuestions.push(q);
      }
    });
  } catch(e) {
    console.log('Skipped', src, '-', e.message);
  }
});

console.log('\nTotal unique questions:', allQuestions.length);

// ===== CSV FORMAT: Anki-compatible =====
// Front: question text
// Back: all options with correct one marked, then the answer letter
function escCsv(str) {
  str = str.replace(/\r?\n/g, ' ').replace(/"/g, '""');
  return '"' + str + '"';
}

let ankiCsv = '';
allQuestions.forEach(q => {
  const front = q.question;

  let back = '';
  Object.entries(q.options).forEach(([letter, text]) => {
    const mark = q.answer.includes(letter) ? ' ✓' : '';
    back += letter + '. ' + text + mark + '<br>';
  });
  back += '<br><b>Answer: ' + q.answer + '</b>';

  ankiCsv += escCsv(front) + ',' + escCsv(back) + '\n';
});

fs.writeFileSync('flashcards-anki.csv', ankiCsv);
console.log('Written: flashcards-anki.csv (Anki format - front,back)');

// ===== CSV FORMAT: Quizlet-compatible =====
// Term (question + options), Definition (answer + correct option text)
let quizletCsv = '';
allQuestions.forEach(q => {
  let term = q.question + '\\n';
  Object.entries(q.options).forEach(([letter, text]) => {
    term += letter + '. ' + text + '\\n';
  });

  const answerLetters = q.answer.split('');
  const correctTexts = answerLetters.map(l => l + '. ' + (q.options[l] || '')).join('; ');
  const definition = 'Answer: ' + q.answer + ' — ' + correctTexts;

  quizletCsv += escCsv(term) + ',' + escCsv(definition) + '\n';
});

fs.writeFileSync('flashcards-quizlet.csv', quizletCsv);
console.log('Written: flashcards-quizlet.csv (Quizlet format - term,definition)');

// ===== CSV FORMAT: Full spreadsheet =====
// id, question, A, B, C, D, E, F, G, answer
let fullCsv = 'id,question,A,B,C,D,E,F,G,answer\n';
allQuestions.forEach((q, i) => {
  let row = (i + 1) + ',' + escCsv(q.question);
  'ABCDEFG'.split('').forEach(l => {
    row += ',' + escCsv(q.options[l] || '');
  });
  row += ',' + escCsv(q.answer);
  fullCsv += row + '\n';
});

fs.writeFileSync('flashcards-full.csv', fullCsv);
console.log('Written: flashcards-full.csv (spreadsheet format - all columns)');

console.log('\nDone! Pick the format you need.');