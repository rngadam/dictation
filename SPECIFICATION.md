## **Project Specification: Dictation Web App (Phase 1, Rev. 2)**

### **Project Overview**

**Dictation** is a minimalist, mobile-friendly, single-page web application designed to help language learners improve their listening and writing skills. Built with plain HTML5 and JavaScript, the application provides a powerful dictation engine. It features a configurable "study" phase, an "audio-only test" phase with granular playback controls, and a final "self-correction" phase to complete the learning loop.

### **Core Features**

* **Text Input:** A simple text area for users to paste their desired dictation text.
* **Multi-Speed Initial Read-Through:** A "study" mode that reads the full text multiple times at decreasing speeds.
* **Dynamic Dictation Engine:** A "test" mode that reads text sentence-by-sentence with adaptive timing.
* **Audio-Only Mode:** Hides the source text during the "test" phase for a true transcription experience.
* **Granular Playback Controls:** In-test controls to repeat the last spoken word or sentence, giving the learner full control over their pacing.
* **Comprehensive Progress Tracking:** Real-time indicators for the current word/sentence and an overall progress bar for the entire text.
* **Manual Self-Correction:** A dedicated "Reveal Text" feature after the dictation for students to check their work against the source text.

### **User Interface (UI) & User Experience (UX)**

The interface is divided into four distinct, user-friendly states.

* **1. Setup View (Pre-Playback):**
    * The text area is visible for pasting text.
    * The "Play" button and Settings icon (`⚙️`) are available.

* **2. Study View (Initial Read-Through):**
    * The source text remains visible, with optional word highlighting.
    * A status indicator shows which read-through is in progress (e.g., "Read-through: 1 of 2").

* **3. Test View (Audio-Only Dictation):**
    * **Overall Progress Bar:** A thin progress bar at the top of the screen shows the percentage of the total text completed.
    * **Hidden Text:** If Audio-Only Mode is on, the text area is hidden.
    * **Progress Panel:** A display shows local progress: `Sentence: 3 / 15`, `Word: 8 / 14`.
    * **Expanded Controls:** The control panel now features:
        * `<< Repeat Word`
        * `<< Repeat Sentence`
        * `Pause / Play`
        * `Stop`

* **4. Correction View (Post-Dictation):**
    * This view appears when the user clicks "Stop" or the dictation finishes.
    * A single, central button is displayed: **"Reveal Text for Correction"**.
    * Clicking this button makes the original source text visible again, allowing the student to compare it with their handwritten work.

### **Functional Requirements**

#### **1. Configurable Initial Read-Through (Study Phase)**
*(This functionality remains unchanged.)*
The application reads the entire text `N` times at decreasing speeds, with optional word highlighting.

#### **2. Dynamic Dictation Loop (Test Phase)**
This phase begins after the study phase.

* **Granular Playback Controls:**
    * **`<< Repeat Word`:** When clicked, the TTS engine re-speaks the last spoken word. Playback then remains paused until the user acts again. The application must maintain an active index of the current word.
    * **`<< Repeat Sentence`:** When clicked, the TTS engine re-speaks the entire current sentence from its beginning. Playback then remains paused. The application must maintain an active index of the current sentence.
* **UI State and Progress Tracking:**
    * The local progress panel (`Sentence: X / Y`) is updated as before.
    * The **Overall Progress Bar** is updated in real-time. Its value is calculated based on the index of the currently spoken word divided by the total number of words in the text.

#### **3. Self-Correction Mechanism**
* When the dictation loop finishes or the user presses the "Stop" button, the Test View is replaced by the Correction View.
* The "Reveal Text for Correction" button becomes the only primary action.
* A click on this button makes the original text `textarea` visible, completing the learning cycle by enabling immediate self-assessment.

### **Technical Specifications**

* **Platform:** A single `index.html` file using plain **HTML5** and **JavaScript (ES6+)**.
* **Styling:** A single CSS file.
    * **Font:** Must be a standard **sans-serif** font (e.g., Arial, Helvetica, `system-ui`).
* **State Management:** The application's JavaScript will need to maintain state for the current sentence index, current word index, and total word count to power the repeat controls and progress bar.
* **Text-to-Speech (TTS):** The browser's native **Web Speech API** (`SpeechSynthesis`). The `onboundary` event may be used to accurately track word-by-word progress for highlighting and state updates.
* **Libraries (via CDN):**
    * A lightweight syllable-counting library (e.g., `syllable.js`) will be loaded from a CDN for the dynamic pause logic.
