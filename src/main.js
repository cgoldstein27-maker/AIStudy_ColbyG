const puzzles = {
  easy: [
    [
      { name: 'Fruits', words: ['Apple', 'Banana', 'Orange', 'Grape'] },
      { name: 'Pets', words: ['Dog', 'Cat', 'Bird', 'Fish'] },
      { name: 'Colors', words: ['Red', 'Blue', 'Green', 'Yellow'] },
      { name: 'Days', words: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] }
    ],
    [
      { name: 'Animals', words: ['Lion', 'Tiger', 'Bear', 'Wolf'] },
      { name: 'Planets', words: ['Mercury', 'Venus', 'Earth', 'Mars'] },
      { name: 'Shapes', words: ['Circle', 'Square', 'Triangle', 'Rectangle'] },
      { name: 'Months', words: ['January', 'February', 'March', 'April'] }
    ],
    [
      { name: 'Vegetables', words: ['Carrot', 'Broccoli', 'Spinach', 'Potato'] },
      { name: 'Sports', words: ['Soccer', 'Basketball', 'Tennis', 'Baseball'] },
      { name: 'Instruments', words: ['Piano', 'Guitar', 'Drums', 'Violin'] },
      { name: 'Seasons', words: ['Spring', 'Summer', 'Fall', 'Winter'] }
    ]
  ],
  medium: [
    [
      { name: 'Things with Keys', words: ['Piano', 'Map', 'Lock', 'Answer'] },
      { name: 'Ocean Creatures', words: ['Shark', 'Whale', 'Octopus', 'Jellyfish'] },
      { name: 'Types of Cheese', words: ['Cheddar', 'Gouda', 'Brie', 'Parmesan'] },
      { name: 'Words with Double Letters', words: ['Book', 'Moon', 'Foot', 'Ball'] }
    ],
    [
      { name: 'Famous Bridges', words: ['Golden Gate', 'Brooklyn', 'London', 'Sydney Harbour'] },
      { name: 'Elements in the Periodic Table', words: ['Iron', 'Gold', 'Silver', 'Copper'] },
      { name: 'Harry Potter Books', words: ['Philosopher\'s Stone', 'Chamber of Secrets', 'Prisoner of Azkaban', 'Goblet of Fire'] },
      { name: 'Types of Pasta', words: ['Spaghetti', 'Penne', 'Fusilli', 'Rigatoni'] }
    ],
    [
      { name: 'Words that Start with "Qu"', words: ['Queen', 'Quiet', 'Quick', 'Quilt'] },
      { name: 'Types of Clouds', words: ['Cumulus', 'Stratus', 'Cirrus', 'Nimbus'] },
      { name: 'Famous Inventors', words: ['Edison', 'Tesla', 'Wright', 'Bell'] },
      { name: 'Words Ending with "ology"', words: ['Biology', 'Psychology', 'Archaeology', 'Sociology'] }
    ]
  ],
  impossible: [
    [
      { name: 'Words that are also Names', words: ['Will', 'Grace', 'Jack', 'Rose'] },
      { name: 'Things that are Measured in Carats', words: ['Diamond', 'Gold', 'Ruby', 'Emerald'] },
      { name: 'Palindromic Words', words: ['Radar', 'Level', 'Racecar', 'Deed'] },
      { name: 'Words that Rhyme with "Orange"', words: ['Nothing', 'Because', 'There are none', 'Really'] }
    ],
    [
      { name: 'Unusual Units of Measurement', words: ['Smoot', 'Barn', 'Furlong', 'Hand'] },
      { name: 'Words that are Pronounced Differently When Capitalized', words: ['Polish', 'Herb', 'Bass', 'Lead'] },
      { name: 'Things that are Illegal in Some Places', words: ['Chewing Gum', 'Driving on the Left', 'Owning a Pet Rock', 'Wearing Crocs'] },
      { name: 'Words that Mean the Opposite in Different Contexts', words: ['Oversight', 'Buckle', 'Trim', 'Bolt'] }
    ],
    [
      { name: 'Words that are Their Own Opposites', words: ['Oversight', 'Buckle', 'Trim', 'Bolt'] },
      { name: 'Fictional Elements from Periodic Tables', words: ['Vibranium', 'Kryptonite', 'Adamantium', 'Unobtainium'] },
      { name: 'Words that are Also Programming Languages', words: ['Python', 'Ruby', 'Java', 'Perl'] },
      { name: 'Things that are Named After People', words: ['Sandwich', 'Watt', 'Pasteur', 'Voltaire'] }
    ]
  ]
};

let currentDifficulty = null;
let currentPuzzle = 0;

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function loadPuzzle() {
  const groups = puzzles[currentDifficulty][currentPuzzle];
  const allWords = groups.flatMap(g => g.words);
  shuffle(allWords);
  const board = document.getElementById('game-board');
  board.innerHTML = '';
  allWords.forEach(word => {
    const btn = document.createElement('button');
    btn.textContent = word;
    btn.classList.add('word-btn');
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      updateSubmit();
    });
    board.appendChild(btn);
  });
  document.getElementById('message').textContent = '';
  updateSubmit();
}

document.getElementById('easy').addEventListener('click', () => {
  currentDifficulty = 'easy';
  startGame();
});

document.getElementById('medium').addEventListener('click', () => {
  currentDifficulty = 'medium';
  startGame();
});

document.getElementById('impossible').addEventListener('click', () => {
  currentDifficulty = 'impossible';
  startGame();
});

function startGame() {
  document.getElementById('start-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  currentPuzzle = 0;
  loadPuzzle();
}

function updateSubmit() {
  const selected = document.querySelectorAll('.selected');
  document.getElementById('submit').disabled = selected.length !== 4;
}

document.getElementById('submit').addEventListener('click', () => {
  const selected = Array.from(document.querySelectorAll('.selected')).map(btn => btn.textContent);
  const groups = puzzles[currentDifficulty][currentPuzzle];
  const found = groups.find(g => g.words.every(w => selected.includes(w)));
  if (found) {
    document.querySelectorAll('.selected').forEach(btn => {
      btn.classList.remove('selected');
      btn.classList.add('solved');
      btn.disabled = true;
    });
    document.getElementById('message').textContent = `Correct! ${found.name}`;
    checkWin();
  } else {
    document.querySelectorAll('.selected').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('message').textContent = 'Wrong group. Try again.';
  }
});

function checkWin() {
  const solved = document.querySelectorAll('.solved').length;
  if (solved === 16) {
    document.getElementById('message').textContent = 'You won! Loading next puzzle...';
    setTimeout(() => {
      currentPuzzle = (currentPuzzle + 1) % puzzles[currentDifficulty].length;
      loadPuzzle();
    }, 2000);
  }
}