// --- STATE MANAGEMENT ---
const state = {
    text: '',
    sentences: [],
    words: [],
    currentSentenceIndex: 0,
    currentWordIndex: 0,
    isSpeaking: false,
    isPaused: false,
    currentView: 'setup', // 'setup', 'study', 'test', 'correction'
};

// --- TTS (Text-to-Speech) ---
const synth = window.speechSynthesis;
let utterance = null;

// --- SETTINGS (configurable) ---
const settings = {
    studyReadThroughs: 2,
    baseSpeed: 1.0,
    syllablePauseMultiplier: 50, // ms per syllable
};

// --- DOM ELEMENTS (will be assigned on DOMContentLoaded) ---
let appContainer, textInput, playBtn, pausePlayBtn, stopBtn, repeatWordBtn,
    repeatSentenceBtn, revealTextBtn, progressBar, studyCountEl, studyTotalEl,
    sentenceCurrentEl, sentenceTotalEl, wordCurrentEl, wordTotalEl;

// --- VIEW MANAGEMENT ---
function switchView(viewName) {
    state.currentView = viewName;
    if (appContainer) {
        appContainer.className = ''; // Reset classes
        appContainer.classList.add(`${viewName}-view`);
    }
    console.log(`Switched to ${viewName} view`);
}

// --- CORE FUNCTIONS ---
function startDictation() {
    state.text = textInput.value.trim();
    if (state.text.length === 0) {
        alert('Please paste some text to begin.');
        return;
    }

    // Tokenization
    state.sentences = state.text.match(/[^.!?]+[.!?\s]*/g) || [state.text];
    state.words = state.text.split(/[\s,;:.!?]+/).filter(Boolean);

    state.currentSentenceIndex = 0;
    state.currentWordIndex = 0;
    state.isPaused = false;

    console.log('Starting dictation process...');
    runStudyPhase();
}

function runStudyPhase() {
    switchView('study');
    let readThroughs = settings.studyReadThroughs;
    if (readThroughs <= 0) {
        runTestPhase();
        return;
    }

    let count = 0;
    studyTotalEl.textContent = readThroughs;

    function readFullText() {
        count++;
        studyCountEl.textContent = count;
        updateOverallProgress(0);

        const speed = settings.baseSpeed - (0.2 * (count - 1));
        const fullTextUtterance = new SpeechSynthesisUtterance(state.text);
        fullTextUtterance.rate = speed > 0.3 ? speed : 0.3;
        fullTextUtterance.onend = () => {
            if (count < readThroughs) {
                setTimeout(readFullText, 1000); // Pause between read-throughs
            } else {
                runTestPhase();
            }
        };

        fullTextUtterance.onboundary = (event) => {
            if (event.name === 'word') {
                const wordIndex = findWordIndexInText(event.charIndex, state.text);
                state.currentWordIndex = wordIndex;
                updateOverallProgress((wordIndex + 1) / state.words.length);
            }
        };

        synth.speak(fullTextUtterance);
    }

    readFullText();
}

function runTestPhase() {
    switchView('test');
    state.currentSentenceIndex = 0;
    state.currentWordIndex = 0;
    speakCurrentSentence();
}

function speakCurrentSentence() {
    if (state.currentSentenceIndex >= state.sentences.length) {
        stopDictation(); // All sentences spoken
        return;
    }

    const sentence = state.sentences[state.currentSentenceIndex];
    utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = settings.baseSpeed;

    utterance.onstart = () => {
        state.isSpeaking = true;
        updateTestStatus();
    };

    utterance.onboundary = (event) => {
        if (event.name === 'word') {
            const sentenceText = state.sentences[state.currentSentenceIndex];
            const localWordIndex = findWordIndexInText(event.charIndex, sentenceText);

            let precedingWords = 0;
            for (let i = 0; i < state.currentSentenceIndex; i++) {
                precedingWords += state.sentences[i].split(/[\s,;:.!?]+/).filter(Boolean).length;
            }

            state.currentWordIndex = precedingWords + localWordIndex;

            updateOverallProgress((state.currentWordIndex + 1) / state.words.length);
            updateTestStatus(localWordIndex);
        }
    };

    utterance.onend = () => {
        state.isSpeaking = false;
        state.currentSentenceIndex++;
        if (state.currentSentenceIndex < state.sentences.length) {
            const syllables = (window.syllable && window.syllable(sentence)) || sentence.length / 5;
            const pauseDuration = syllables * settings.syllablePauseMultiplier;
            setTimeout(speakCurrentSentence, pauseDuration);
        } else {
            switchView('correction');
        }
    };

    synth.speak(utterance);
}

function stopDictation() {
    synth.cancel();
    state.isSpeaking = false;
    state.isPaused = false;
    switchView('correction');
    resetProgress();
    console.log('Dictation stopped.');
}

function togglePause() {
    if (state.isSpeaking) {
        if (state.isPaused) {
            synth.resume();
            state.isPaused = false;
            pausePlayBtn.textContent = 'Pause';
        } else {
            synth.pause();
            state.isPaused = true;
            pausePlayBtn.textContent = 'Play';
        }
    }
}

function repeatLastWord() {
    if (!state.isSpeaking && !state.isPaused) return;

    synth.cancel();

    const wordToRepeat = state.words[state.currentWordIndex];
    if (wordToRepeat) {
        const repeatUtterance = new SpeechSynthesisUtterance(wordToRepeat);
        repeatUtterance.rate = settings.baseSpeed;
        synth.speak(repeatUtterance);
    }

    if (!state.isPaused) {
        togglePause();
    }
    console.log(`Repeating word: ${wordToRepeat}`);
}

function repeatCurrentSentence() {
    if (!state.isSpeaking && !state.isPaused) return;

    synth.cancel();

    const sentenceToRepeat = state.sentences[state.currentSentenceIndex];
    if (sentenceToRepeat) {
        const repeatUtterance = new SpeechSynthesisUtterance(sentenceToRepeat);
        repeatUtterance.rate = settings.baseSpeed;
        synth.speak(repeatUtterance);
    }

    if (!state.isPaused) {
        togglePause();
    }
    console.log(`Repeating sentence: ${sentenceToRepeat.trim()}`);
}

function revealText() {
    switchView('revealed-text');
    textInput.readOnly = true;
    playBtn.textContent = 'Reset';
    playBtn.removeEventListener('click', startDictation);
    playBtn.addEventListener('click', resetApp);
}

function resetApp() {
    synth.cancel();

    Object.assign(state, {
        text: '', sentences: [], words: [], currentSentenceIndex: 0,
        currentWordIndex: 0, isSpeaking: false, isPaused: false,
    });

    textInput.value = '';
    textInput.readOnly = false;
    playBtn.textContent = 'Play';
    playBtn.removeEventListener('click', resetApp);
    playBtn.addEventListener('click', startDictation);

    resetProgress();
    switchView('setup');
}

function updateTestStatus(localWordIndex = 0) {
    if (state.currentSentenceIndex >= state.sentences.length) return;

    sentenceTotalEl.textContent = state.sentences.length;
    sentenceCurrentEl.textContent = state.currentSentenceIndex + 1;

    const wordsInSentence = state.sentences[state.currentSentenceIndex].split(/[\s,;:.!?]+/).filter(Boolean);
    wordTotalEl.textContent = wordsInSentence.length;
    wordCurrentEl.textContent = localWordIndex + 1;
}

function findWordIndexInText(charIndex, text) {
    const words = text.split(/[\s,;:.!?]+/).filter(Boolean);
    let searchOffset = 0;
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordPos = text.indexOf(word, searchOffset);
        if (charIndex >= wordPos && charIndex < wordPos + word.length) {
            return i;
        }
        searchOffset = wordPos + word.length;
    }
    return words.length - 1;
}

function updateOverallProgress(progress) {
    progressBar.style.width = `${progress * 100}%`;
}

function resetProgress() {
    progressBar.style.width = '0%';
}


document.addEventListener('DOMContentLoaded', () => {
    // --- ASSIGN DOM ELEMENTS ---
    appContainer = document.getElementById('app-container');
    textInput = document.getElementById('text-input');
    playBtn = document.getElementById('play-btn');
    pausePlayBtn = document.getElementById('pause-play-btn');
    stopBtn = document.getElementById('stop-btn');
    repeatWordBtn = document.getElementById('repeat-word-btn');
    repeatSentenceBtn = document.getElementById('repeat-sentence-btn');
    revealTextBtn = document.getElementById('reveal-text-btn');
    progressBar = document.getElementById('progress-bar');
    studyCountEl = document.getElementById('study-count');
    studyTotalEl = document.getElementById('study-total');
    sentenceCurrentEl = document.getElementById('sentence-current');
    sentenceTotalEl = document.getElementById('sentence-total');
    wordCurrentEl = document.getElementById('word-current');
    wordTotalEl = document.getElementById('word-total');

    // --- EVENT LISTENERS ---
    playBtn.addEventListener('click', startDictation);
    stopBtn.addEventListener('click', stopDictation);
    pausePlayBtn.addEventListener('click', togglePause);
    repeatWordBtn.addEventListener('click', repeatLastWord);
    repeatSentenceBtn.addEventListener('click', repeatCurrentSentence);
    revealTextBtn.addEventListener('click', revealText);

    // Initialize view
    switchView('setup');
});
