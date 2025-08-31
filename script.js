import { franc } from 'https://esm.sh/franc@6?bundle';
import accentuation from 'https://esm.sh/modern-greek-accentuation';

const { modernGreekSyllabify } = accentuation;

// --- STATE MANAGEMENT ---
const state = {
    text: '',
    lang: 'en-US', // Default language
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
    syllablePauseMultiplier: 50, // ms per syllable. Renamed to pauseMultiplier in UI.
    readingMode: 'sentence', // 'sentence', 'word', 'syllable'
    wordPause: 200, // ms
    syllablePause: 100, // ms
};

// --- DOM ELEMENTS (will be assigned on DOMContentLoaded) ---
let appContainer, textInput, playBtn, pausePlayBtn, stopBtn, repeatWordBtn,
    repeatSentenceBtn, revealTextBtn, progressBar, studyCountEl, studyTotalEl,
    sentenceCurrentEl, sentenceTotalEl, wordCurrentEl, wordTotalEl,
    settingsIcon, settingsModal, settingsForm, settingsCloseBtn,
    studyReadThroughsInput, baseSpeedInput, baseSpeedDisplay,
    pauseMultiplierInput, pauseMultiplierDisplay, readingModeSelect,
    wordPauseGroup, wordPauseInput, syllablePauseGroup, syllablePauseInput,
    testStatus, syllableStatus, syllableCurrent, syllableTotal;

// --- VIEW MANAGEMENT ---
function switchView(viewName) {
    state.currentView = viewName;
    if (appContainer) {
        appContainer.className = ''; // Reset classes
        appContainer.classList.add(`${viewName}-view`);
    }
    console.log(`Switched to ${viewName} view`);
}

const langMap = {
    'eng': 'en-US',
    'spa': 'es-ES',
    'fra': 'fr-FR',
    'deu': 'de-DE',
    'ita': 'it-IT',
    'jpn': 'ja-JP',
    'rus': 'ru-RU',
    'ell': 'el-GR', // Greek
    'cmn': 'zh-CN', // Mandarin Chinese
};

// --- CORE FUNCTIONS ---
function startDictation() {
    state.text = textInput.value.trim();
    if (state.text.length === 0) {
        alert('Please paste some text to begin.');
        return;
    }

    // Language Detection
    const langCode = franc(state.text, { minLength: 3 });
    state.lang = langMap[langCode] || 'en-US';
    console.log(`Detected language: ${langCode} -> ${state.lang}`);


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
        fullTextUtterance.lang = state.lang;
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

    const { readingMode } = settings;

    if (readingMode === 'syllable' && state.lang === 'el-GR') {
        testStatus.classList.add('syllable-mode');
        speakSyllableBySyllable();
    } else {
        testStatus.classList.remove('syllable-mode');
        if (readingMode === 'word') {
            speakWordByWord();
        } else {
            speakCurrentSentence();
        }
    }
}

function speakCurrentSentence() {
    if (state.currentSentenceIndex >= state.sentences.length) {
        stopDictation(); // All sentences spoken
        return;
    }

    const sentence = state.sentences[state.currentSentenceIndex];
    utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = settings.baseSpeed;
    utterance.lang = state.lang;

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
            // For English, we use the syllable library for more natural pausing.
            // For other languages, syllable() returns 0, so we fall back to a
            // character-length-based heuristic, which is language-agnostic.
            const syllables = (state.lang === 'en-US' && window.syllable && window.syllable(sentence)) || (sentence.length / 5);
            const pauseDuration = syllables * settings.syllablePauseMultiplier;
            setTimeout(speakCurrentSentence, pauseDuration);
        } else {
            switchView('correction');
        }
    };

    synth.speak(utterance);
}

function speakWordByWord() {
    if (state.currentSentenceIndex >= state.sentences.length) {
        switchView('correction');
        return;
    }

    const sentence = state.sentences[state.currentSentenceIndex];
    const wordsInSentence = sentence.split(/[\s,;:.!?]+/).filter(Boolean);
    let wordInSentenceIndex = 0;

    function speakNextWord() {
        if (wordInSentenceIndex >= wordsInSentence.length) {
            // End of sentence, move to the next one
            state.currentSentenceIndex++;
            speakWordByWord(); // Recurse for the next sentence
            return;
        }

        // --- Update Progress ---
        let precedingWords = 0;
        for (let i = 0; i < state.currentSentenceIndex; i++) {
            precedingWords += state.sentences[i].split(/[\s,;:.!?]+/).filter(Boolean).length;
        }
        state.currentWordIndex = precedingWords + wordInSentenceIndex;
        updateOverallProgress((state.currentWordIndex + 1) / state.words.length);
        updateTestStatus(wordInSentenceIndex);
        // --- End Progress Update ---

        const word = wordsInSentence[wordInSentenceIndex];
        const wordUtterance = new SpeechSynthesisUtterance(word);
        wordUtterance.lang = state.lang;
        wordUtterance.rate = settings.baseSpeed;

        wordUtterance.onend = () => {
            wordInSentenceIndex++;
            setTimeout(speakNextWord, settings.wordPause);
        };

        synth.speak(wordUtterance);
    }

    speakNextWord();
}

function speakSyllableBySyllable() {
    if (state.currentSentenceIndex >= state.sentences.length) {
        switchView('correction');
        return;
    }

    const sentence = state.sentences[state.currentSentenceIndex];
    const wordsInSentence = sentence.split(/[\s,;:.!?]+/).filter(Boolean);
    let wordInSentenceIndex = 0;
    let syllableInWordIndex = 0;
    let syllablesOfCurrentWord = [];

    function speakNextSyllable() {
        if (syllableInWordIndex >= syllablesOfCurrentWord.length) {
            // End of word, move to the next one
            wordInSentenceIndex++;
            syllableInWordIndex = 0;
            setTimeout(processNextWord, settings.wordPause);
            return;
        }

        // Update syllable progress
        syllableCurrent.textContent = syllableInWordIndex + 1;
        syllableTotal.textContent = syllablesOfCurrentWord.length;

        const syllable = syllablesOfCurrentWord[syllableInWordIndex];
        const syllableUtterance = new SpeechSynthesisUtterance(syllable);
        syllableUtterance.lang = state.lang;
        syllableUtterance.rate = settings.baseSpeed;

        syllableUtterance.onend = () => {
            syllableInWordIndex++;
            setTimeout(speakNextSyllable, settings.syllablePause);
        };

        synth.speak(syllableUtterance);
    }

    function processNextWord() {
        if (wordInSentenceIndex >= wordsInSentence.length) {
            // End of sentence
            state.currentSentenceIndex++;
            speakSyllableBySyllable(); // Recurse for next sentence
            return;
        }

        // --- Update Word Progress ---
        let precedingWords = 0;
        for (let i = 0; i < state.currentSentenceIndex; i++) {
            precedingWords += state.sentences[i].split(/[\s,;:.!?]+/).filter(Boolean).length;
        }
        state.currentWordIndex = precedingWords + wordInSentenceIndex;
        updateOverallProgress((state.currentWordIndex + 1) / state.words.length);
        updateTestStatus(wordInSentenceIndex);
        // --- End Word Progress Update ---

        const word = wordsInSentence[wordInSentenceIndex];
        syllablesOfCurrentWord = modernGreekSyllabify(word);
        speakNextSyllable();
    }

    processNextWord();
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
        repeatUtterance.lang = state.lang;
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
        repeatUtterance.lang = state.lang;
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


function openSettingsModal() {
    // Populate the form with current settings
    studyReadThroughsInput.value = settings.studyReadThroughs;
    baseSpeedInput.value = settings.baseSpeed;
    baseSpeedDisplay.textContent = settings.baseSpeed;
    pauseMultiplierInput.value = settings.syllablePauseMultiplier;
    pauseMultiplierDisplay.textContent = settings.syllablePauseMultiplier;
    readingModeSelect.value = settings.readingMode;
    wordPauseInput.value = settings.wordPause;
    syllablePauseInput.value = settings.syllablePause;

    // Update visibility of pause inputs
    togglePauseInputs();

    settingsModal.classList.add('visible');
}

function closeSettingsModal() {
    settingsModal.classList.remove('visible');
}

function saveSettings(event) {
    event.preventDefault();
    settings.studyReadThroughs = parseInt(studyReadThroughsInput.value, 10);
    settings.baseSpeed = parseFloat(baseSpeedInput.value);
    settings.syllablePauseMultiplier = parseInt(pauseMultiplierInput.value, 10);
    settings.readingMode = readingModeSelect.value;
    settings.wordPause = parseInt(wordPauseInput.value, 10);
    settings.syllablePause = parseInt(syllablePauseInput.value, 10);
    console.log('Settings saved:', settings);
    closeSettingsModal();
}

function togglePauseInputs() {
    const selectedMode = readingModeSelect.value;
    wordPauseGroup.style.display = selectedMode === 'word' ? 'block' : 'none';
    syllablePauseGroup.style.display = selectedMode === 'syllable' ? 'block' : 'none';
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
    settingsIcon = document.getElementById('settings-icon');
    settingsModal = document.getElementById('settings-modal');
    settingsForm = document.getElementById('settings-form');
    settingsCloseBtn = document.getElementById('settings-close-btn');
    studyReadThroughsInput = document.getElementById('study-read-throughs-input');
    baseSpeedInput = document.getElementById('base-speed-input');
    baseSpeedDisplay = document.getElementById('base-speed-display');
    pauseMultiplierInput = document.getElementById('pause-multiplier-input');
    pauseMultiplierDisplay = document.getElementById('pause-multiplier-display');
    readingModeSelect = document.getElementById('reading-mode-select');
    wordPauseGroup = document.getElementById('word-pause-group');
    wordPauseInput = document.getElementById('word-pause-input');
    syllablePauseGroup = document.getElementById('syllable-pause-group');
    syllablePauseInput = document.getElementById('syllable-pause-input');
    testStatus = document.getElementById('test-status');
    syllableStatus = document.getElementById('syllable-status');
    syllableCurrent = document.getElementById('syllable-current');
    syllableTotal = document.getElementById('syllable-total');


    // --- EVENT LISTENERS ---
    playBtn.addEventListener('click', startDictation);
    stopBtn.addEventListener('click', stopDictation);
    pausePlayBtn.addEventListener('click', togglePause);
    repeatWordBtn.addEventListener('click', repeatLastWord);
    repeatSentenceBtn.addEventListener('click', repeatCurrentSentence);
    revealTextBtn.addEventListener('click', revealText);
    settingsIcon.addEventListener('click', openSettingsModal);
    settingsCloseBtn.addEventListener('click', closeSettingsModal);
    settingsForm.addEventListener('submit', saveSettings);
    readingModeSelect.addEventListener('change', togglePauseInputs);

    // Live update for range sliders
    baseSpeedInput.addEventListener('input', (e) => baseSpeedDisplay.textContent = e.target.value);
    pauseMultiplierInput.addEventListener('input', (e) => pauseMultiplierDisplay.textContent = e.target.value);


    // Initialize view
    switchView('setup');
});
