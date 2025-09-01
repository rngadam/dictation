import { franc } from 'https://esm.sh/franc@6?bundle';

// --- STATE MANAGEMENT ---
const state = {
    text: '',
    lang: 'en-US',
    paragraphs: [],
    sentences: [], // Sentences for the entire text
    sentencesInParagraph: [], // Sentences for the current paragraph
    words: [],
    currentParagraphIndex: 0,
    currentSentenceIndex: 0,
    currentWordIndex: 0,
    isSpeaking: false,
    isPaused: false,
    currentView: 'setup',
    speechQueue: [],
};

// --- SETTINGS (configurable) ---
const settings = {
    studyReadThroughs: 2,
    baseSpeed: 1.0,
    sentencePauseMultiplier: 50,
    readingMode: 'sentence',
    wordPause: 200,
    paragraphPause: 1000,
    paragraphRepeats: 1,
    sentenceRepeats: 1,
    wordRepeats: 1,
};

// --- DOM ELEMENTS (will be assigned on DOMContentLoaded) ---
let appContainer, textInput, playBtn, pausePlayBtn, stopBtn, repeatWordBtn,
    repeatSentenceBtn, repeatParagraphBtn, revealTextBtn, progressBar,
    studyCountEl, studyTotalEl, sentenceCurrentEl, sentenceTotalEl,
    wordCurrentEl, wordTotalEl, settingsIcon, settingsModal, settingsForm,
    settingsCloseBtn, studyReadThroughsInput, baseSpeedInput, baseSpeedDisplay,
    pauseMultiplierInput, pauseMultiplierDisplay, readingModeSelect,
    wordPauseGroup, wordPauseInput, paragraphPauseInput, testStatus,
    paragraphRepeatsInput, sentenceRepeatsInput, wordRepeatsGroup, wordRepeatsInput;

// --- TTS ---
const synth = window.speechSynthesis;
let utterance = null;


// --- LOGIC ---

function switchView(viewName) {
    state.currentView = viewName;
    if (appContainer) {
        appContainer.className = '';
        appContainer.classList.add(`${viewName}-view`);
    }
    console.log(`Switched to ${viewName} view`);
}

const langMap = {
    'eng': 'en-US', 'spa': 'es-ES', 'fra': 'fr-FR', 'deu': 'de-DE',
    'ita': 'it-IT', 'jpn': 'ja-JP', 'rus': 'ru-RU', 'ell': 'el-GR', 'cmn': 'zh-CN',
};

function startDictation() {
    state.text = textInput.value.trim();
    if (state.text.length === 0) {
        alert('Please paste some text to begin.');
        return;
    }

    const langCode = franc(state.text, { minLength: 3 });
    state.lang = langMap[langCode] || 'en-US';
    console.log(`Detected language: ${langCode} -> ${state.lang}`);

    state.paragraphs = state.text.split(/\n+/).filter(p => p.trim().length > 0);
    state.sentences = state.text.match(/[^.!?]+[.!?\s]*/g) || [state.text];
    state.words = state.text.split(/[\s,;:.!?]+/).filter(Boolean);

    state.currentParagraphIndex = 0;
    state.currentSentenceIndex = 0;
    state.currentWordIndex = 0;
    state.isPaused = false;

    console.log('Starting dictation process...');

    // The new engine bypasses the old study/test phase distinction for now
    // It directly builds and processes a queue based on all settings.
    switchView('test'); // Go directly to the test view
    state.isSpeaking = true;
    buildSpeechQueue();
    processSpeechQueue();
}

// All the old speech functions are removed, replaced by the queue engine.

function stopDictation() {
    state.isSpeaking = false; // This will halt the processSpeechQueue loop
    state.isPaused = false;
    state.speechQueue = []; // Clear any pending items
    synth.cancel(); // Stop any current utterance
    switchView('correction');
    resetProgress();
    console.log('Dictation stopped.');
}

function togglePause() {
    if (!state.isSpeaking) return;

    if (state.isPaused) {
        state.isPaused = false;
        synth.resume();
        // The queue processor will automatically continue on the next 'end' event
        pausePlayBtn.textContent = 'Pause';
    } else {
        state.isPaused = true;
        synth.pause();
        pausePlayBtn.textContent = 'Play';
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
    const sentenceToRepeat = state.sentencesInParagraph[state.currentSentenceIndex];
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

function repeatCurrentParagraph() {
    if (!state.isSpeaking && !state.isPaused) return;
    synth.cancel();
    const paragraphToRepeat = state.paragraphs[state.currentParagraphIndex];
    if (paragraphToRepeat) {
        const repeatUtterance = new SpeechSynthesisUtterance(paragraphToRepeat);
        repeatUtterance.rate = settings.baseSpeed;
        repeatUtterance.lang = state.lang;
        synth.speak(repeatUtterance);
    }
    if (!state.isPaused) {
        togglePause();
    }
    console.log(`Repeating paragraph: ${paragraphToRepeat.trim()}`);
}

function revealText() {
    switchView('revealed-text');
    textInput.readOnly = true;
    playBtn.textContent = 'Reset';
    playBtn.removeEventListener('click', startDictation);
    playBtn.addEventListener('click', resetApp);
}

function buildSpeechQueue() {
    state.speechQueue = [];
    let globalWordIndex = 0;

    for (let p_rep = 0; p_rep < settings.paragraphRepeats; p_rep++) {
        state.paragraphs.forEach((paragraph, p_idx) => {
            const sentences = paragraph.match(/[^.!?]+[.!?\s]*/g) || [paragraph];
            for (let s_rep = 0; s_rep < settings.sentenceRepeats; s_rep++) {
                sentences.forEach((sentence, s_idx) => {
                    const words = sentence.split(/[\s,;:.!?]+/).filter(Boolean);
                    if (settings.readingMode === 'sentence') {
                        state.speechQueue.push({ text: sentence, pause: settings.sentencePauseMultiplier, p_idx, s_idx, w_idx: words.length - 1 });
                        globalWordIndex += words.length;
                    } else {
                        for (let w_rep = 0; w_rep < settings.wordRepeats; w_rep++) {
                            words.forEach((word, w_idx) => {
                                if (settings.readingMode === 'word') {
                                    state.speechQueue.push({ text: word, pause: settings.wordPause, p_idx, s_idx, w_idx });
                                }
                                if (w_rep === settings.wordRepeats - 1) globalWordIndex++;
                            });
                        }
                    }
                    if (state.speechQueue.length > 0) state.speechQueue[state.speechQueue.length - 1].pause = settings.sentencePauseMultiplier;
                });
            }
            if (state.speechQueue.length > 0) state.speechQueue[state.speechQueue.length - 1].pause = settings.paragraphPause;
        });
    }
    console.log('Speech queue built:', state.speechQueue.length, 'items');
}

function processSpeechQueue() {
    if (state.speechQueue.length === 0 || !state.isSpeaking) {
        if (state.isSpeaking) { // Finished the queue
            switchView('correction');
        }
        state.isSpeaking = false;
        return;
    }

    const task = state.speechQueue.shift();

    // --- Update UI ---
    state.currentParagraphIndex = task.p_idx;
    // This is complex, need a better way to get global sentence index
    // For now, local sentence index is fine for the UI
    state.currentSentenceIndex = task.s_idx;

    // Find global word index for progress bar
    let precedingWords = 0;
    for (let i = 0; i < task.p_idx; i++) {
        precedingWords += state.paragraphs[i].split(/[\s,;:.!?]+/).filter(Boolean).length;
    }
    const sentencesInCurrentPara = state.paragraphs[task.p_idx].match(/[^.!?]+[.!?\s]*/g) || [];
    for (let i = 0; i < task.s_idx; i++) {
        precedingWords += sentencesInCurrentPara[i]?.split(/[\s,;:.!?]+/).filter(Boolean).length || 0;
    }
    state.currentWordIndex = precedingWords + task.w_idx;
    updateOverallProgress((state.currentWordIndex + 1) / state.words.length);
    updateTestStatus(task.w_idx);

    // --- End UI Update ---

    utterance = new SpeechSynthesisUtterance(task.text);
    utterance.lang = state.lang;
    utterance.rate = settings.baseSpeed;

    utterance.onend = () => {
        if (state.isSpeaking) { // If not stopped
            setTimeout(() => processSpeechQueue(), task.pause);
        }
    };

    synth.speak(utterance);
}


function resetApp() {
    synth.cancel();
    Object.assign(state, {
        text: '', paragraphs: [], sentences: [], sentencesInParagraph: [], words: [],
        speechQueue: [],
        currentParagraphIndex: 0, currentSentenceIndex: 0, currentWordIndex: 0,
        isSpeaking: false, isPaused: false,
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
    if (state.currentSentenceIndex >= state.sentencesInParagraph.length) return;
    sentenceTotalEl.textContent = state.sentencesInParagraph.length;
    sentenceCurrentEl.textContent = state.currentSentenceIndex + 1;
    const wordsInSentence = state.sentencesInParagraph[state.currentSentenceIndex]?.split(/[\s,;:.!?]+/).filter(Boolean) || [];
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
    studyReadThroughsInput.value = settings.studyReadThroughs;
    baseSpeedInput.value = settings.baseSpeed;
    baseSpeedDisplay.textContent = settings.baseSpeed;
    pauseMultiplierInput.value = settings.sentencePauseMultiplier;
    pauseMultiplierDisplay.textContent = settings.sentencePauseMultiplier;
    readingModeSelect.value = settings.readingMode;
    wordPauseInput.value = settings.wordPause;
    paragraphPauseInput.value = settings.paragraphPause;
    paragraphRepeatsInput.value = settings.paragraphRepeats;
    sentenceRepeatsInput.value = settings.sentenceRepeats;
    wordRepeatsInput.value = settings.wordRepeats;
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
    settings.sentencePauseMultiplier = parseInt(pauseMultiplierInput.value, 10);
    settings.readingMode = readingModeSelect.value;
    settings.wordPause = parseInt(wordPauseInput.value, 10);
    settings.paragraphPause = parseInt(paragraphPauseInput.value, 10);
    settings.paragraphRepeats = parseInt(paragraphRepeatsInput.value, 10);
    settings.sentenceRepeats = parseInt(sentenceRepeatsInput.value, 10);
    settings.wordRepeats = parseInt(wordRepeatsInput.value, 10);
    console.log('Settings saved:', settings);
    closeSettingsModal();
}

function togglePauseInputs() {
    const selectedMode = readingModeSelect.value;
    wordPauseGroup.style.display = selectedMode === 'word' ? 'block' : 'none';
    wordRepeatsGroup.style.display = selectedMode === 'word' ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    appContainer = document.getElementById('app-container');
    textInput = document.getElementById('text-input');
    playBtn = document.getElementById('play-btn');
    pausePlayBtn = document.getElementById('pause-play-btn');
    stopBtn = document.getElementById('stop-btn');
    repeatWordBtn = document.getElementById('repeat-word-btn');
    repeatSentenceBtn = document.getElementById('repeat-sentence-btn');
    repeatParagraphBtn = document.getElementById('repeat-paragraph-btn');
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
    paragraphPauseInput = document.getElementById('paragraph-pause-input');
    testStatus = document.getElementById('test-status');
    paragraphRepeatsInput = document.getElementById('paragraph-repeats-input');
    sentenceRepeatsInput = document.getElementById('sentence-repeats-input');
    wordRepeatsGroup = document.getElementById('word-repeats-group');
    wordRepeatsInput = document.getElementById('word-repeats-input');

    playBtn.addEventListener('click', startDictation);
    stopBtn.addEventListener('click', stopDictation);
    pausePlayBtn.addEventListener('click', togglePause);
    repeatWordBtn.addEventListener('click', repeatLastWord);
    repeatSentenceBtn.addEventListener('click', repeatCurrentSentence);
    repeatParagraphBtn.addEventListener('click', repeatCurrentParagraph);
    revealTextBtn.addEventListener('click', revealText);
    settingsIcon.addEventListener('click', openSettingsModal);
    settingsCloseBtn.addEventListener('click', closeSettingsModal);
    settingsForm.addEventListener('submit', saveSettings);
    readingModeSelect.addEventListener('change', togglePauseInputs);

    baseSpeedInput.addEventListener('input', (e) => baseSpeedDisplay.textContent = e.target.value);
    pauseMultiplierInput.addEventListener('input', (e) => pauseMultiplierDisplay.textContent = e.target.value);

    document.addEventListener('keydown', (event) => {
        if (state.currentView !== 'test') {
            return;
        }
        if (event.code === 'Space') {
            event.preventDefault();
            togglePause();
        } else if (event.ctrlKey && event.code === 'KeyR') {
            event.preventDefault();
            repeatCurrentSentence();
        } else if (event.ctrlKey && event.code === 'KeyW') {
            event.preventDefault();
            repeatLastWord();
        } else if (event.ctrlKey && event.code === 'KeyP') {
            event.preventDefault();
            repeatCurrentParagraph();
        }
    });

    switchView('setup');
});

// Expose functions for testing
window.testing = {
    startDictation,
    state, // Expose state for test manipulation
    resetApp
};
