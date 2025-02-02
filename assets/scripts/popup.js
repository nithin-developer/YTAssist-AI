let currentVideoId = null;
let isAnalyzing = false;
let chatHistory = [];
let isConnected = true;

// Initialize UI elements
const analyzeButton = document.getElementById("analyze-current-tab");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-message");
const chatContainer = document.getElementById("chat-container");

// Add this at the top of popup.js
function formatMarkdown(text) {
  return (
    text
      // Format headings with specific spacing
      .replace(
        /##\s*(.*)/g,
        '<h2 class="text-lg font-semibold mt-0 mb-0">$1</h2>'
      )
      // Format bullet points
      .replace(
        /•\s*(.*)/g,
        '<div class="flex items-start space-x-2 mb-1"><span class="text-blue-500">•</span><span>$1</span></div>'
      )
      // Format bold text
      .replace(/\*\*(.*?)\*\*/g, '<span class="font-semibold">$1</span>')
      // Format paragraphs with less spacing
      .replace(/\n\n/g, '<div class="mb-2"></div>')
      // Format single line breaks
      .replace(/\n/g, "<br>")
      // Clean up any extra spaces
      .replace(/\s+/g, " ")
      // Clean up any empty paragraphs
      .replace(
        /<div class="mb-2"><\/div>\s*<div class="mb-2"><\/div>/g,
        '<div class="mb-2"></div>'
      )
  );
}

// Add message to chat
function addMessage(type, content) {
  // Hide welcome message if it exists
  const welcomeMessage = document.getElementById("welcome-message");
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = `message-container flex justify-${
    type === "user" ? "end" : "start"
  } animate-slideIn`;

  let formattedContent =
    type === "assistant" ? formatMarkdown(content) : content;

  // Add message to history
  chatHistory.push({
    type,
    content: content,
    timestamp: new Date().toISOString(),
  });

  const messageContent =
    type === "error"
      ? `<div class="bg-red-100 text-red-700 rounded-lg px-4 py-2 max-w-3/4">${content}</div>`
      : `<div class="flex items-start space-x-3 ${
          type === "user" ? "flex-row-reverse space-x-reverse" : ""
        }">
            ${
              type === "assistant"
                ? `
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                        </svg>
                    </div>
                </div>
            `
                : ""
            }
            <div class="${
              type === "user" ? "message-user" : "message-assistant"
            } prose prose-sm">${formattedContent}</div>
          </div>`;

  messageDiv.innerHTML = messageContent;
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Add these functions to handle the thinking indicator
function showThinkingIndicator() {
  const messageDiv = document.createElement("div");
  messageDiv.id = "thinking-indicator";
  messageDiv.className = "message-container flex justify-start animate-slideIn";

  const messageContent = `
        <div class="flex items-start space-x-3">
            <div class="flex-shrink-0">
                <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                    </svg>
                </div>
            </div>
            <div class="message-assistant thinking-bubble">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>`;

  messageDiv.innerHTML = messageContent;
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeThinkingIndicator() {
  const indicator = document.getElementById("thinking-indicator");
  if (indicator) {
    indicator.remove();
  }
}

// Add connection check function
function checkConnection() {
  if (!isConnected) {
    addMessage(
      "error",
      "Please analyze the video first to start the conversation."
    );
    return false;
  }
  return true;
}

// Update handleSendMessage function
async function handleSendMessage() {
  const message = chatInput.value.trim();
  if (!message || !currentVideoId) return;

  if (!checkConnection()) return;

  chatInput.value = "";
  addMessage("user", message);
  showThinkingIndicator();

  try {
    const response = await chrome.runtime.sendMessage({
      action: "chatQuery",
      videoId: currentVideoId,
      message: message,
    });

    removeThinkingIndicator();

    if (response.error) {
      addMessage("error", response.error);
      isConnected = false;
    } else {
      addMessage("assistant", response);
    }
  } catch (error) {
    removeThinkingIndicator();
    addMessage("error", "Failed to get response. Please try again.");
    isConnected = false;
  }
}

// Enable/disable chat interface
function setChatEnabled(enabled) {
  chatInput.disabled = !enabled;
  sendButton.disabled = !enabled;
  if (enabled) {
    chatInput.focus();
  }
}

// Handle video analysis
async function analyzeCurrentVideo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes("youtube.com/watch")) {
    addMessage("error", "Please navigate to a YouTube video first!");
    return;
  }

  try {
    isAnalyzing = true;
    analyzeButton.disabled = true;
    analyzeButton.innerHTML = `
            <div class="loading-spinner w-5 h-5"></div>
            <span>Analyzing...</span>
        `;

    const videoId = new URLSearchParams(new URL(tab.url).search).get("v");
    currentVideoId = videoId;

    const response = await chrome.runtime.sendMessage({
      action: "analyzeVideo",
      videoId: videoId,
    });

    if (response.error) {
      addMessage("error", response.error);
      isConnected = false;
    } else {
      addMessage("assistant", response);
      setChatEnabled(true);
      isConnected = true; // Set connection state to true after successful analysis
    }
  } catch (error) {
    addMessage("error", "Failed to analyze video. Please try again.");
    isConnected = false;
  } finally {
    isAnalyzing = false;
    analyzeButton.disabled = false;
    analyzeButton.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Analyze Video</span>
        `;
  }
}

// Event listeners
analyzeButton.addEventListener("click", analyzeCurrentVideo);
sendButton.addEventListener("click", handleSendMessage);
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleSendMessage();
});

// Initialize
setChatEnabled(false);

// Update the DOMContentLoaded event listener
document.addEventListener("DOMContentLoaded", () => {

  // Initialize other UI elements
  const analyzeButton = document.getElementById("analyze-current-tab");
  const chatInput = document.getElementById("chat-input");
  const sendButton = document.getElementById("send-message");

  if (analyzeButton)
    analyzeButton.addEventListener("click", analyzeCurrentVideo);
  if (sendButton) sendButton.addEventListener("click", handleSendMessage);
  if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleSendMessage();
    });
  }

  // Initialize chat state
  setChatEnabled(false);
});
