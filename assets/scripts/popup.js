let currentVideoId = null;
let isAnalyzing = false;
let chatHistory = [];
let isConnected = true;

const analyzeButton = document.getElementById("analyze-current-tab");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-message");
const chatContainer = document.getElementById("chat-container");

function encryptData(data, key = "your-secure-key-here") {
  try {
    const jsonString = JSON.stringify(data);
    const encodedData = btoa(unescape(encodeURIComponent(jsonString)));
    return encodedData
      .split("")
      .map((char, index) => {
        return String.fromCharCode(
          char.charCodeAt(0) ^ key.charCodeAt(index % key.length)
        );
      })
      .join("");
  } catch (error) {
    console.error("Encryption error:", error);
    return null;
  }
}

function decryptData(encryptedData, key = "your-secure-key-here") {
  try {
    const decrypted = encryptedData
      .split("")
      .map((char, index) => {
        return String.fromCharCode(
          char.charCodeAt(0) ^ key.charCodeAt(index % key.length)
        );
      })
      .join("");
    const decodedData = decodeURIComponent(escape(atob(decrypted)));
    return JSON.parse(decodedData);
  } catch (error) {
    console.error("Decryption error:", error);
    return null;
  }
}

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

async function getVideoTitle(videoId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "getVideoTitle",
      videoId: videoId,
    });
    return response.title || "Untitled Chat";
  } catch (error) {
    console.error("Error getting video title:", error);
    return "Untitled Chat";
  }
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

  const messageContent = createMessageContent(type, formattedContent);

  messageDiv.innerHTML = messageContent;
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  chrome.storage.local.get(["chatHistories"], async (result) => {
    try {
      let histories = {};

      if (result.chatHistories) {
        histories = decryptData(result.chatHistories) || {};
      }

      let currentChatId = sessionStorage.getItem("currentChatId");

      if (!currentChatId || !histories[currentChatId]) {
        const videoTitle = await getVideoTitle(currentVideoId);
        let newTitle = videoTitle;

        if (type === "assistant" && content.includes("Video Analysis")) {
          let chatNumber = 1;
          const existingChats = Object.values(histories)
            .filter((chat) => chat.videoId === currentVideoId)
            .map((chat) => chat.title);

          while (existingChats.includes(newTitle)) {
            chatNumber++;
            newTitle = `${videoTitle} (${chatNumber})`;
          }

          currentChatId = `${currentVideoId}_${Date.now()}`;
        } else {
          currentChatId = `${currentVideoId}_${Date.now()}`;
          if (currentVideoId) {
            newTitle = `${videoTitle} - Chat`;
          } else {
            newTitle = "New Chat";
          }
        }

        histories[currentChatId] = {
          title: newTitle,
          timestamp: new Date().toISOString(),
          messages: [
            {
              type,
              content,
              timestamp: new Date().toISOString(),
            },
          ],
          videoId: currentVideoId,
          context:
            type === "assistant" && content.includes("Video Analysis")
              ? content
              : null,
        };

        sessionStorage.setItem("currentChatId", currentChatId);
      } else {
        if (!histories[currentChatId].messages) {
          histories[currentChatId].messages = [];
        }

        histories[currentChatId].messages.push({
          type,
          content,
          timestamp: new Date().toISOString(),
        });

        histories[currentChatId].timestamp = new Date().toISOString();
      }

      const encryptedHistories = encryptData(histories);
      if (encryptedHistories) {
        await chrome.storage.local.set({ chatHistories: encryptedHistories });
        updateChatHistoryList();
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });
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

  const sidebar = document.getElementById("sidebar");
  const mainToggleButton = document.getElementById("main-toggle-sidebar");
  const newChatButton = document.getElementById("new-chat");

  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  function toggleSidebar() {
    sidebar.classList.toggle("collapsed");
    overlay.classList.toggle("active");
  }

  if (mainToggleButton) {
    mainToggleButton.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSidebar();
    });
  }

  overlay.addEventListener("click", toggleSidebar);

  sidebar.classList.add("collapsed");

  newChatButton.addEventListener("click", () => {
    chatHistory = [];
    currentVideoId = null;

    chatContainer.innerHTML = `
      <!-- Welcome Message -->
      <div id="welcome-message" class="flex flex-col items-center justify-center h-full text-center">
        <div class="mb-8 mx-auto text-center">
          <img
            src="icons/logo.webp"
            alt="YouTube Analyzer"
            class="w-32 h-32 rounded-full shadow-lg mb-6 mx-auto"
          />
          <h2 class="text-2xl font-bold text-gray-800 mb-3">
            Welcome to YTAssist AI!
          </h2>
          <p class="text-gray-600 max-w-md mx-auto">
            Navigate to any YouTube video and click "Analyze" to start
            exploring insights powered by Gemini AI.
          </p>
        </div>
        <div class="animate-bounce">
          <svg
            class="w-6 h-6 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            ></path>
          </svg>
        </div>
      </div>
    `;

    setChatEnabled(false);

    const newChatId = Date.now().toString();
    chrome.storage.local.get(["chatHistories"], (result) => {
      const histories = result.chatHistories || {};
      histories[newChatId] = {
        title: "New Chat",
        timestamp: new Date().toISOString(),
        messages: [],
        videoId: null,
      };

      chrome.storage.local.set({ chatHistories: histories }, () => {
        updateChatHistoryList();
      });
    });

    toggleSidebar();
  });

  document.querySelectorAll(".chat-history-item").forEach((item) => {
    item.addEventListener("click", () => {
      const chatId = item.getAttribute("data-chat-id");
      console.log(
        "Loading chat history:",
        item.querySelector("h3").textContent
      );

      loadChatHistory(chatId);

      toggleSidebar();
    });
  });

  if (newChatButton) {
    newChatButton.addEventListener("click", createNewChat);
  }

  updateChatHistoryList();
});

function loadChatHistory(chatId) {
  chatContainer.innerHTML = "";

  chrome.storage.local.get(["chatHistories"], (result) => {
    try {
      let histories = {};

      if (result.chatHistories) {
        histories = decryptData(result.chatHistories) || {};
      }

      const selectedChat = histories[chatId];

      if (selectedChat) {
        currentVideoId = selectedChat.videoId;
        chatHistory = selectedChat.messages || [];
        sessionStorage.setItem("currentChatId", chatId);

        setChatEnabled(!!selectedChat.videoId);

        if (selectedChat.messages && selectedChat.messages.length > 0) {
          selectedChat.messages.forEach((message) => {
            const messageDiv = document.createElement("div");
            messageDiv.className = `message-container flex justify-${
              message.type === "user" ? "end" : "start"
            } animate-slideIn`;

            let formattedContent =
              message.type === "assistant"
                ? formatMarkdown(message.content)
                : message.content;

            const messageContent = createMessageContent(
              message.type,
              formattedContent
            );
            messageDiv.innerHTML = messageContent;
            chatContainer.appendChild(messageDiv);
          });

          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
    }
  });
}

function updateChatHistoryList() {
  const historyContainer = document.querySelector(".p-2.space-y-2");

  chrome.storage.local.get(["chatHistories"], (result) => {
    try {
      let histories = {};

      if (result.chatHistories) {
        histories = decryptData(result.chatHistories) || {};
      }

      const sortedChats = Object.entries(histories).sort(
        ([, a], [, b]) => new Date(b.timestamp) - new Date(a.timestamp)
      );

      historyContainer.innerHTML = sortedChats
        .map(
          ([chatId, chat]) => `
          <div class="p-3 hover:bg-gray-100 rounded-lg cursor-pointer chat-history-item" data-chat-id="${chatId}">
            <h3 class="font-medium text-gray-800 truncate">
              ${chat.title || "Untitled Chat"}
            </h3>
            <p class="text-sm text-gray-500">
              ${new Date(chat.timestamp).toLocaleString()}
            </p>
          </div>
        `
        )
        .join("");

      document.querySelectorAll(".chat-history-item").forEach((item) => {
        item.addEventListener("click", () => {
          const chatId = item.getAttribute("data-chat-id");
          loadChatHistory(chatId);
          toggleSidebar();
        });
      });
    } catch (error) {
      console.error("Error updating chat history:", error);
    }
  });
}

function createNewChat() {
  chatContainer.innerHTML = "";
  chatHistory = [];
  currentVideoId = null;
  sessionStorage.removeItem("currentChatId");

  chatContainer.innerHTML = `
    <div id="welcome-message" class="text-center p-8 text-gray-500">
      <h2 class="text-xl font-semibold mb-4">Welcome to YouTube Video Analyzer</h2>
      <p class="mb-4">Navigate to a YouTube video and click "Analyze Video" to get started.</p>
      <div class="animate-bounce">
        <svg class="w-6 h-6 text-blue-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
        </svg>
      </div>
    </div>
  `;

  setChatEnabled(false);
}

function createMessageContent(type, content) {
  return type === "error"
    ? `<div class="bg-red-100 text-red-700 rounded-lg px-4 py-2 max-w-3/4">${content}</div>`
    : `<div class="flex items-start space-x-3 ${
        type === "user" ? "flex-row-reverse space-x-reverse" : ""
      }">
          ${
            type === "assistant"
              ? `<div class="flex-shrink-0">
                  <div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                    </svg>
                  </div>
                </div>`
              : ""
          }
          <div class="${
            type === "user" ? "message-user" : "message-assistant"
          } prose prose-sm">${content}</div>
        </div>`;
}
