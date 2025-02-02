let currentVideoId = null;
let isAnalyzing = false;
let chatHistory = [];
let isConnected = true;

const analyzeButton = document.getElementById("analyze-current-tab");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-message");
const chatContainer = document.getElementById("chat-container");

function formatMarkdown(text) {
  return text

    .replace(
      /##\s*(.*)/g,
      '<h2 class="text-lg font-semibold mt-0 mb-0">$1</h2>'
    )

    .replace(
      /•\s*(.*)/g,
      '<div class="flex items-start space-x-2 mb-1"><span class="text-blue-500">•</span><span>$1</span></div>'
    )

    .replace(/\*\*(.*?)\*\*/g, '<span class="font-semibold">$1</span>')

    .replace(/\n\n/g, '<div class="mb-2"></div>')

    .replace(/\n/g, "<br>")

    .replace(/\s+/g, " ")

    .replace(
      /<div class="mb-2"><\/div>\s*<div class="mb-2"><\/div>/g,
      '<div class="mb-2"></div>'
    );
}

function addMessage(type, content) {
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

function setChatEnabled(enabled) {
  chatInput.disabled = !enabled;
  sendButton.disabled = !enabled;
  if (enabled) {
    chatInput.focus();
  }
}

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
      isConnected = true;
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

analyzeButton.addEventListener("click", analyzeCurrentVideo);
sendButton.addEventListener("click", handleSendMessage);
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") handleSendMessage();
});

setChatEnabled(false);

function toggleExportDropdown() {
  const dropdown = document.getElementById("export-dropdown");
  if (!dropdown) return;
  dropdown.classList.toggle("hidden");
}

function waitForHtml2pdf() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 10;

    const checkHtml2pdf = () => {
      if (typeof html2pdf !== "undefined") {
        resolve();
      } else if (attempts >= maxAttempts) {
        reject(new Error("html2pdf failed to load"));
      } else {
        attempts++;
        setTimeout(checkHtml2pdf, 500);
      }
    };

    checkHtml2pdf();
  });
}

function exportToPDF() {
  try {
    if (chatHistory.length === 0) {
      addMessage("error", "No chat history to export.");
      return;
    }

    const doc = new jsPDF();
    let yPos = 20;

    doc.setFontSize(20);
    doc.setTextColor(26, 115, 232);
    doc.text("Chat History", 20, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(102, 102, 102);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, yPos);
    yPos += 4;

    if (currentVideoId) {
      doc.text(`Video ID: ${currentVideoId}`, 20, yPos);
      yPos += 4;
    }

    doc.setDrawColor(238, 238, 238);
    doc.line(20, yPos, 190, yPos);
    yPos += 6;

    chatHistory.forEach((msg) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(11);
      doc.setTextColor(msg.type === "user" ? [26, 115, 232] : [52, 168, 83]);

      doc.setFont(undefined, "bold");
      const role = msg.type === "user" ? "You" : "Assistant";
      doc.text(`${role}:`, 20, yPos);
      yPos += 5;

      doc.setFont(undefined, "normal");
      doc.setTextColor(0);
      const lines = doc.splitTextToSize(msg.content, 170);

      doc.text(lines, 20, yPos);
      yPos += lines.length * 5 + 8;
    });

    const filename = `chat-history-${currentVideoId || "export"}-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`;
    doc.save(filename);
    // addMessage("system", "PDF exported successfully!");
  } catch (error) {
    console.error("PDF generation error:", error);
    addMessage("error", "Failed to generate PDF. Please try again.");
  }
}

function exportToJSON() {
  const exportData = {
    videoId: currentVideoId,
    timestamp: new Date().toISOString(),
    messages: chatHistory,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `chat-history-${currentVideoId || "export"}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  const exportButton = document.getElementById("export-button");
  const exportDropdown = document.getElementById("export-dropdown");
  const exportPDFButton = document.getElementById("export-pdf");
  const exportJSONButton = document.getElementById("export-json");

  if (exportButton) {
    exportButton.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleExportDropdown();
    });
  }

  if (exportPDFButton) {
    exportPDFButton.addEventListener("click", () => {
      exportToPDF();
      toggleExportDropdown();
    });
  }

  if (exportJSONButton) {
    exportJSONButton.addEventListener("click", () => {
      exportToJSON();
      toggleExportDropdown();
    });
  }

  document.addEventListener("click", (e) => {
    if (
      exportDropdown &&
      !exportButton?.contains(e.target) &&
      !exportDropdown?.contains(e.target)
    ) {
      exportDropdown.classList.add("hidden");
    }
  });

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

  setChatEnabled(false);
});
