// test.js
import fetch from 'node-fetch'; // Need to import fetch for Node.js

class GeminiAPI {
    constructor() {
        // Separate keys for each API
        this.GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
        this.YOUTUBE_API_KEY = 'YOUR_YOUTUBE_API_KEY';
        this.BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
        this.YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
        this.conversationHistory = new Map();
        this.metadataCache = new Map();
    }

    async fetchVideoMetadata(videoId) {
        try {
            if (this.metadataCache.has(videoId)) {
                return this.metadataCache.get(videoId);
            }

            // Add error handling for videoId
            if (!videoId) {
                throw new Error('Video ID is required');
            }

            // Debug log
            console.log(`Fetching video data for ID: ${videoId}`);
            console.log(`Using URL: ${this.YOUTUBE_API_BASE_URL}/videos`);

            const params = new URLSearchParams({
                part: 'snippet,contentDetails,statistics',
                id: videoId,
                key: this.YOUTUBE_API_KEY
            });

            // Debug log
            console.log('Request URL:', `${this.YOUTUBE_API_BASE_URL}/videos?${params}`);

            const videoResponse = await fetch(
                `${this.YOUTUBE_API_BASE_URL}/videos?${params}`,
                {
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            );

            if (!videoResponse.ok) {
                const errorText = await videoResponse.text();
                console.error('YouTube API Error:', errorText);
                throw new Error(`YouTube API error: ${videoResponse.status} ${videoResponse.statusText}`);
            }

            const videoData = await videoResponse.json();
            
            // Debug log
            console.log('Video API Response:', JSON.stringify(videoData, null, 2));

            if (!videoData.items || videoData.items.length === 0) {
                throw new Error('Video not found');
            }

            // Rest of the function remains the same...
            const snippet = videoData.items[0].snippet;
            const contentDetails = videoData.items[0].contentDetails;
            const statistics = videoData.items[0].statistics;

            const metadata = {
                title: snippet.title,
                description: snippet.description,
                publishedAt: new Date(snippet.publishedAt).toLocaleDateString(),
                channelTitle: snippet.channelTitle,
                channelId: snippet.channelId,
                duration: this.formatDuration(contentDetails.duration),
                viewCount: parseInt(statistics.viewCount).toLocaleString(),
                likeCount: parseInt(statistics.likeCount || 0).toLocaleString(),
                commentCount: parseInt(statistics.commentCount || 0).toLocaleString(),
                tags: snippet.tags || [],
                thumbnails: snippet.thumbnails,
                category: snippet.categoryId,
                language: snippet.defaultLanguage || snippet.defaultAudioLanguage
            };

            this.metadataCache.set(videoId, metadata);
            return metadata;

        } catch (error) {
            console.error('Detailed error:', error);
            throw new Error(`Failed to fetch video metadata: ${error.message}`);
        }
    }

    formatDuration(duration) {
        // Convert ISO 8601 duration to readable format
        const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
        
        const hours = (match[1] || '').replace('H', '');
        const minutes = (match[2] || '').replace('M', '');
        const seconds = (match[3] || '').replace('S', '');

        let formatted = '';
        
        if (hours) formatted += `${hours}:`;
        formatted += `${minutes.padStart(2, '0')}:`;
        formatted += seconds.padStart(2, '0');

        return formatted;
    }

    // ... rest of the class implementation ...
}

// Test the implementation
const runTest = async () => {
    try {
        const geminiAPI = new GeminiAPI();
        const metadata = await geminiAPI.fetchVideoMetadata('VIDEO_ID');
        console.log('Successfully retrieved metadata:', metadata);
    } catch (error) {
        console.error('Test failed:', error.message);
    }
};

runTest();




