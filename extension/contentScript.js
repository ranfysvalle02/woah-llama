// contentScript.js

// ======== Configuration ========
// IMPORTANT: Storing API keys directly in client-side scripts is insecure.
// Consider moving API interactions to a secure backend server.
const ELEVEN_LABS_API_KEY = '';
let ELEVEN_LABS_VOICE_ID = 'fnoOtHjtLbYs6mOpUSdr'; // e.g., '21m00Tcm4TlvDq8ikWAM'

// ======== Generate Speech Function ========
async function generateSpeech(text, voiceId, apiKey) {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (response.ok) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } else {
      const errorData = await response.json();
      throw new Error(`Failed to generate speech: ${errorData.error || response.statusText}`);
    }
  } catch (error) {
    console.error('Error in generateSpeech:', error);
    throw error;
  }
}

// ======== Create Sidebar HTML with Close Button ========
const sidebarHTML = `
  <div id="transcription-sidebar">
    <header>
      <h2>Live Transcription</h2>
      <sub>[powered by llama3.2+ElevenLabs]</sub>
      <img src="https://www.verbolabs.com/wp-content/uploads/2021/08/good-Translation-Services.jpeg" style="width:100%;" />
      <button class="close-btn" title="Close Sidebar">&times;</button>
    </header>
    <div id="controls">
      <button id="start-btn">Start</button>
      <button id="stop-btn" disabled>Stop</button>
      <button id="clear-btn">Clear Transcriptions</button>
    </div>
    <div id="transcriptions"></div>
  </div>
`;

// ======== Inject Sidebar into the Page ========
const sidebarContainer = document.createElement('div');
sidebarContainer.innerHTML = sidebarHTML;
document.body.appendChild(sidebarContainer);

// ======== Access Elements ========
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const clearBtn = document.getElementById('clear-btn');
const transcriptionsDiv = document.getElementById('transcriptions');
const closeBtn = document.querySelector('.close-btn');

// ======== Initialize Variables ========
let recognition;
let isRecognizing = false;
let transcriptions = [];

// ======== Add Minimal Styles for Speak Buttons ========
const buttonStyle = document.createElement('style');
buttonStyle.textContent = `
  /* Speak Button Styles */
  .speak-btn {
    background: none;
    border: none;
    cursor: pointer;
    margin-left: 5px;
    font-size: 1em;
    vertical-align: middle;
  }

  .speak-btn:hover {
    color: #4CAF50; /* Optional: Change color on hover */
  }

  /* Optional: Style for the Speak Button Icon */
  .speak-btn::before {
    content: '▶️';
    display: inline-block;
    margin-right: 3px;
  }
`;
document.head.appendChild(buttonStyle);

// ======== Clear Transcriptions ========
function clearTranscriptions() {
  transcriptions = [];
  chrome.storage.local.set({ transcriptions }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error clearing transcriptions:', chrome.runtime.lastError);
    }
  });
  renderTranscriptions();
}

// ======== Load Transcriptions from Storage ========
chrome.storage.local.get(['transcriptions'], (result) => {
  transcriptions = result.transcriptions || [];
  renderTranscriptions();
});

// ======== Event Listener for Clear Button ========
clearBtn.addEventListener('click', clearTranscriptions);

// ======== Initialize Speech Recognition ========
function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Sorry, your browser does not support Speech Recognition.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        const transcript = event.results[i][0].transcript.trim();
        addTranscription(transcript);
      }
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    alert(`Speech recognition error: ${event.error}`);
  };

  recognition.onend = () => {
    if (isRecognizing) {
      recognition.start(); // Restart recognition if it ended unexpectedly
    }
  };
}

// ======== Start Recognition ========
function startRecognition() {
  if (isRecognizing) return;
  isRecognizing = true;
  initRecognition();
  if (recognition) {
    recognition.start();
    startBtn.disabled = true;
    stopBtn.disabled = false;
  }
}

// ======== Stop Recognition ========
function stopRecognition() {
  if (!isRecognizing) return;
  isRecognizing = false;
  if (recognition) {
    recognition.stop();
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// ======== Add Transcription and Send to Endpoint ========
function addTranscription(text) {
  const transcription = {
    text: text,
    timestamp: new Date().toLocaleTimeString(),
    processed: false, // Flag to prevent re-processing on reload
    response: null
  };
  transcriptions.push(transcription);
  const index = transcriptions.length - 1;
  saveTranscriptions();
  renderTranscription(transcription, index);
  sendToEndpoint(transcription, index);
}

// ======== Save Transcriptions to Storage ========
function saveTranscriptions() {
  chrome.storage.local.set({ transcriptions }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error saving transcriptions:', chrome.runtime.lastError);
    }
  });
}

// ======== Load and Render Transcriptions ========
function renderTranscriptions() {
  transcriptionsDiv.innerHTML = '';
  transcriptions.forEach((transcription, index) => {
    renderTranscription(transcription, index);
    if (!transcription.processed) {
      sendToEndpoint(transcription, index);
    }
  });
}

// ======== Render a Single Transcription ========
function renderTranscription(transcription, index) {
  let div = document.getElementById('transcription-' + index);

  if (!div) {
    // If the div doesn't exist, create it
    div = document.createElement('div');
    div.className = 'transcription-item';
    div.id = 'transcription-' + index;

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = `[${transcription.timestamp}]`;
    div.appendChild(timestampSpan);

    const textPara = document.createElement('p');
    textPara.className = 'text';
    textPara.textContent = transcription.text;
    div.appendChild(textPara);

    // Add Speak Button for Original Text
    const speakButton = document.createElement('button');
    speakButton.className = 'speak-btn';
    speakButton.title = 'Speak';
    speakButton.addEventListener('click', () => handleSpeak(transcription.text, speakButton));
    textPara.appendChild(speakButton);

    transcriptionsDiv.appendChild(div);
  }

  // Handle the response (translations)
  if (transcription.response) {
    let responsePara = div.querySelector('p.response');
    if (!responsePara) {
      responsePara = document.createElement('p');
      responsePara.className = 'response';
      div.appendChild(responsePara);
    }
    responsePara.innerHTML = ''; // Clear existing content

    const responseTexts = transcription.response.split('<br />');
    responseTexts.forEach((respText) => {
      const respSpan = document.createElement('span');
      respSpan.textContent = respText;
      responsePara.appendChild(respSpan);

      // Add Speak Button for Each Translation
      const speakBtn = document.createElement('button');
      speakBtn.className = 'speak-btn';
      speakBtn.title = 'Speak';
      speakBtn.addEventListener('click', () => handleSpeak(stripHTML(respText), speakBtn));
      responsePara.appendChild(speakBtn);

      responsePara.appendChild(document.createElement('br'));
    });
  }

  // Scroll to the bottom to show the latest transcription
  transcriptionsDiv.scrollTop = transcriptionsDiv.scrollHeight;
}

// ======== Helper Function to Strip HTML Tags ========
function stripHTML(html) {
  var tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

// ======== Handle Speak Button Click ========
async function handleSpeak(text, button) {
  try {
    // Optionally disable the button to prevent multiple clicks
    button.disabled = true;

    // Generate Speech Audio URL
    const audioUrl = await generateSpeech(text, ELEVEN_LABS_VOICE_ID, ELEVEN_LABS_API_KEY);

    // Create and Play Audio
    const audio = new Audio(audioUrl);
    audio.play();

    // Re-enable the button after playback
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      button.disabled = false;
    };

    // Handle audio playback errors
    audio.onerror = () => {
      console.error('Error playing audio.');
      alert('Failed to play audio.');
      button.disabled = false;
    };
  } catch (error) {
    console.error('Error in handleSpeak:', error);
    alert('Failed to generate speech. Please try again.');
    button.disabled = false;
  }
}

// ======== Send Transcription to the Endpoint ========
function sendToEndpoint(transcription, index) {
  const languages = ['Spanish', 'French', 'Portuguese'];
  const fetchPromises = languages.map((lang) => {
    const promptText = `Translate this text into ${lang}: ${transcription.text}. Include flag emoji representing language. Respond with plaintext+emoji.`;
    const encodedText = encodeURIComponent(promptText);
    const endpoint = `http://localhost:5000/q?prompt=${encodedText}`;

    return fetch(endpoint)
      .then(response => response.json())
      .then(data => {
        // Assuming the endpoint returns JSON with a 'response' field
        return data.response || 'No result returned';
      })
      .catch(error => {
        console.error('Error sending transcription to endpoint:', error);
        // Return an error message to include it in the processedText
        return `Error processing text for ${lang}`;
      });
  });

  // Wait for all fetch promises to resolve
  Promise.all(fetchPromises)
    .then(results => {
      const processedText = results.join('<br />');
      transcriptions[index].processed = true;
      transcriptions[index].response = processedText;
      saveTranscriptions();
      renderTranscription(transcriptions[index], index);
    })
    .catch(error => {
      console.error('Error processing all translations:', error);
      transcriptions[index].processed = true;
      transcriptions[index].response = 'Error processing translations';
      saveTranscriptions();
      renderTranscription(transcriptions[index], index);
    });
}

// ======== Event Listener for Close Button ========
closeBtn.addEventListener('click', () => {
  sidebarContainer.style.transform = 'translateX(100%)';
  setTimeout(() => {
    sidebarContainer.remove();
  }, 300); // Match the CSS transition duration if any
});

// ======== Event Listeners for Start and Stop Buttons ========
startBtn.addEventListener('click', startRecognition);
stopBtn.addEventListener('click', stopRecognition);
