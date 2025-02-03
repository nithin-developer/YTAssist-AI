class GeminiAPI {
  async analyzeVideo(videoId) {
    try {
      if (this.analysisCache.has(videoId)) {
        console.log("Returning cached analysis for video:", videoId);
        return this.analysisCache.get(videoId);
      }

      const videoData = await this.fetchVideoMetadata(videoId);
      const prompt = this.createAnalysisPrompt(videoData);
      const analysis = await this.generateContent(prompt);

      this.analysisCache.set(videoId, analysis);

      this.conversationHistory.set(videoId, {
        context: analysis,
        messages: [],
      });

      await this.saveToStorage();

      return analysis;
    } catch (error) {
      console.error("Error analyzing video:", error);
      throw error;
    }
  }

  constructor() {
    this.API_KEY = "your-api-key";
    this.YOUTUBE_API_KEY = "your-api-key";

    this.BASE_URL =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";
    this.YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";
    this.conversationHistory = new Map();
    this.metadataCache = new Map();
    this.analysisCache = new Map();

    this.initializeStorage();
  }

  async initializeStorage() {
    try {
      const data = await chrome.storage.local.get(["encryptedCache"]);

      if (data.encryptedCache) {
        const decryptedData = decryptData(data.encryptedCache);
        if (decryptedData) {
          this.conversationHistory = new Map(
            Object.entries(decryptedData.conversationHistory || {})
          );
          this.analysisCache = new Map(
            Object.entries(decryptedData.analysisCache || {})
          );
          this.metadataCache = new Map(
            Object.entries(decryptedData.metadataCache || {})
          );
        }
      }
    } catch (error) {
      console.error("Storage initialization error:", error);
    }
  }

  async saveToStorage() {
    try {
      const dataToStore = {
        conversationHistory: Object.fromEntries(this.conversationHistory),
        analysisCache: Object.fromEntries(this.analysisCache),
        metadataCache: Object.fromEntries(this.metadataCache),
      };

      const encryptedData = encryptData(dataToStore);
      if (encryptedData) {
        await chrome.storage.local.set({
          encryptedCache: encryptedData,
        });
      }
    } catch (error) {
      console.error("Storage save error:", error);
    }
  }

  async fetchVideoMetadata(videoId) {
    try {
      if (this.metadataCache.has(videoId)) {
        return this.metadataCache.get(videoId);
      }

      const videoResponse = await fetch(
        `${this.YOUTUBE_API_BASE_URL}/videos?` +
          new URLSearchParams({
            part: "snippet,contentDetails,statistics",
            id: videoId,
            key: this.YOUTUBE_API_KEY,
          })
      );

      if (!videoResponse.ok) {
        throw new Error("Failed to fetch video data");
      }

      const videoData = await videoResponse.json();

      if (!videoData.items || videoData.items.length === 0) {
        throw new Error("Video not found");
      }

      const captionsResponse = await fetch(
        `${this.YOUTUBE_API_BASE_URL}/captions?` +
          new URLSearchParams({
            part: "snippet",
            videoId: videoId,
            key: this.YOUTUBE_API_KEY,
          })
      );

      let captionsAvailable = false;
      let captionLanguages = [];

      if (captionsResponse.ok) {
        const captionsData = await captionsResponse.json();
        captionsAvailable = captionsData.items && captionsData.items.length > 0;
        captionLanguages =
          captionsData.items?.map((item) => item.snippet.language) || [];
      }

      const snippet = videoData.items[0].snippet;
      const contentDetails = videoData.items[0].contentDetails;
      const statistics = videoData.items[0].statistics;

      const duration = this.formatDuration(contentDetails.duration);

      const metadata = {
        title: snippet.title,
        description: snippet.description,
        publishedAt: new Date(snippet.publishedAt).toLocaleDateString(),
        channelTitle: snippet.channelTitle,
        channelId: snippet.channelId,
        duration: duration,
        viewCount: parseInt(statistics.viewCount).toLocaleString(),
        likeCount: parseInt(statistics.likeCount || 0).toLocaleString(),
        commentCount: parseInt(statistics.commentCount || 0).toLocaleString(),
        tags: snippet.tags || [],
        thumbnails: snippet.thumbnails,
        category: snippet.categoryId,
        language: snippet.defaultLanguage || snippet.defaultAudioLanguage,
        captionsAvailable,
        captionLanguages,
        privacyStatus: snippet.privacyStatus,
      };

      this.metadataCache.set(videoId, metadata);

      return metadata;
    } catch (error) {
      console.error("Error fetching video metadata:", error);
      throw new Error(`Failed to fetch video metadata: ${error.message}`);
    }
  }

  formatDuration(duration) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);

    const hours = (match[1] || "").replace("H", "");
    const minutes = (match[2] || "").replace("M", "");
    const seconds = (match[3] || "").replace("S", "");

    let formatted = "";

    if (hours) formatted += `${hours}:`;
    formatted += `${minutes.padStart(2, "0")}:`;
    formatted += seconds.padStart(2, "0");

    return formatted;
  }

  createAnalysisPrompt(videoData) {
    return {
      text: `Analyze this YouTube video:
                Title: ${videoData.title}
                Channel: ${videoData.channelTitle}
                Duration: ${videoData.duration}
                Views: ${videoData.viewCount}
                Published: ${videoData.publishedAt}

                Description: ${videoData.description}

                Please provide a professional analysis in the following format:

                ## Video Overview
                [A brief 2-3 sentence summary of the video]

                ## Key Topics
                • [Topic 1]
                • [Topic 2]
                • [Topic 3]
                [etc...]

                ## Main Points
                • [Key point 1]
                • [Key point 2]
                • [Key point 3]
                [etc...]

                ## Video Statistics
                • Duration: ${videoData.duration}
                • Views: ${videoData.viewCount}
                • Likes: ${videoData.likeCount}
                • Comments: ${videoData.commentCount}

                ## Engagement Questions
                [3-4 thought-provoking questions about the video content]

                Format the response using markdown for better readability.`,
    };
  }

  async generateContent(prompt) {
    const response = await fetch(`${this.BASE_URL}?key=${this.API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt.text,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to generate content");
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  async handleChatQuery(videoId, message) {
    try {
      const data = await chrome.storage.local.get(["chatHistories"]);
      const histories = data.chatHistories || {};
      const currentChatId = Object.keys(histories).find(
        (id) =>
          histories[id].videoId === videoId && histories[id].messages.length > 0
      );

      let context = "";
      if (currentChatId && histories[currentChatId]) {
        context = histories[currentChatId].context || "";
      } else {
        context = await this.analyzeVideo(videoId);
      }

      const prompt = {
        text: `You are a helpful AI assistant analyzing a YouTube video.
              Context: ${context}
              
              Previous messages: ${JSON.stringify(
                histories[currentChatId]?.messages || []
              )}
              
              User question: ${message}
              
              Please provide a clear and concise answer based on the video content.
              Format the response in a readable way using markdown.`,
      };

      const response = await this.generateContent(prompt);
      return response;
    } catch (error) {
      console.error("Error in handleChatQuery:", error);
      throw error;
    }
  }

  async getVideoTitle(videoId) {
    try {
      if (this.metadataCache.has(videoId)) {
        return this.metadataCache.get(videoId).title;
      }

      const response = await fetch(
        `${this.YOUTUBE_API_BASE_URL}/videos?part=snippet&id=${videoId}&key=${this.YOUTUBE_API_KEY}`
      );
      const data = await response.json();

      if (data.items && data.items[0]) {
        const title = data.items[0].snippet.title.trim();

        this.metadataCache.set(videoId, { title });
        return title;
      }
      return "Untitled Video";
    } catch (error) {
      console.error("Error fetching video title:", error);
      return "Untitled Video";
    }
  }

  async cacheVideoMetadata(videoId, metadata) {
    this.metadataCache.set(videoId, metadata);
    await this.saveToStorage();
  }
}

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

const geminiAPI = new GeminiAPI();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);

  if (request.action === "analyzeVideo") {
    console.log("Processing analyzeVideo action for videoId:", request.videoId);

    if (!geminiAPI.API_KEY || !geminiAPI.YOUTUBE_API_KEY) {
      console.error("API keys not configured");
      sendResponse({ error: "API keys not configured" });
      return true;
    }

    geminiAPI
      .analyzeVideo(request.videoId)
      .then((response) => {
        console.log("Analysis complete:", response);
        sendResponse(response);
      })
      .catch((error) => {
        console.error("Analysis error:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (request.action === "chatQuery") {
    console.log("Processing chatQuery action with videoId:", request.videoId);
    geminiAPI
      .handleChatQuery(request.videoId, request.message)
      .then((response) => {
        console.log("Chat response:", response);
        sendResponse(response);
      })
      .catch((error) => {
        console.error("Chat error:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (request.action === "getVideoTitle") {
    console.log("Getting title for video:", request.videoId);
    geminiAPI
      .getVideoTitle(request.videoId)
      .then((title) => {
        sendResponse({ title });
      })
      .catch((error) => {
        console.error("Error getting video title:", error);
        sendResponse({ title: "Untitled Video" });
      });
    return true;
  }
});
