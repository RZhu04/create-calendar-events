import { OPENAI_API_KEY, GOOGLE_CLIENT_ID } from './config.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "createEvent") {
        console.log("Received createEvent request:", message.eventDetails);
        createCalendarEvent(message.eventDetails, sendResponse);
        return true;
    }
    if (message.action === "parseEvent") {
        console.log("📝 Received parse event request:", message);
        
        parseEventWithGPT(message.input)
            .then(parsedEvent => {
                console.log("✅ Successfully parsed event:", parsedEvent);
                sendResponse({ success: true, data: parsedEvent });
            })
            .catch(error => {
                console.error("❌ Error in parseEvent:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Required for async response
    }
});

async function createCalendarEvent(eventDetails, sendResponse) {
    try {
        console.log("[Service Worker] Getting access token...");
        const token = await getAccessToken();
        console.log("[Service Worker] Token obtained successfully");

        // Format the event data properly for Google Calendar API
        const eventData = {
            summary: eventDetails.summary,
            start: {
                dateTime: new Date(eventDetails.start.dateTime).toISOString(),
                timeZone: eventDetails.start.timeZone
            },
            end: {
                dateTime: new Date(eventDetails.end.dateTime).toISOString(),
                timeZone: eventDetails.end.timeZone
            }
        };

        console.log("[Service Worker] Formatted event data:", eventData);

        const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(eventData)
        });

        if (response.ok) {
            console.log("[Service Worker] Event created successfully");
            sendResponse({ success: true });
        } else {
            const errorData = await response.json();
            console.error("[Service Worker] Failed to create event. Status:", response.status, "Error:", errorData);
            sendResponse({ success: false, error: errorData });
        }
    } catch (error) {
        console.error("[Service Worker] Error creating event:", error);
        sendResponse({ success: false, error: error.message });
    }
}

async function getAccessToken() {
    try {
        const manifest = chrome.runtime.getManifest();
        return await chrome.identity.getAuthToken({
            interactive: true,
            client_id: GOOGLE_CLIENT_ID,
            scopes: manifest.oauth2.scopes
        });
    } catch (error) {
        console.error('Error getting auth token:', error);
        throw error;
    }
}

async function parseEventWithGPT(userInput) {
    try {
        console.log("🔄 Making OpenAI API request with input:", userInput);
        
        if (!OPENAI_API_KEY) {
            throw new Error("OpenAI API key is not configured");
        }

        // Get current date and time in user's timezone
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const now = new Date();
        const currentDate = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format
        const currentTime = now.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: userTimeZone 
        });

        console.log("🌍 User timezone:", userTimeZone);
        console.log("📅 Current date:", currentDate);
        console.log("🕒 Current time:", currentTime);

        const systemPrompt = `You are a calendar event parser. 
            Timezone Context:
            - User timezone: ${userTimeZone}
            - Current date: ${currentDate}
            - Current time: ${currentTime}

            Parse the input and return ONLY a JSON object with these fields:
            - summary: event title/description
            - startTime: time in 24-hour format (HH:MM)
            - endTime: time in 24-hour format (HH:MM)
            - date: YYYY-MM-DD

            Rules:
            - Use the user's timezone (${userTimeZone})
            - If no date is specified, use TODAY (${currentDate})
            - Only use tomorrow's date if:
                1. The user specifically mentions "tomorrow" or
                2. The requested time is more than 24 hours in the past
            - For times between midnight and 4am, assume today unless specified
            - For "noon", use 12:00
            - For "midnight", use 00:00
            - Remove words like "from", "at", "to" from the summary`;

        const requestBody = {
            model: "gpt-4o-mini",
            messages: [{
                role: "system",
                content: systemPrompt
            }, {
                role: "user",
                content: userInput
            }],
            temperature: 0.3
        };

        console.log("📤 Request body:", requestBody);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        console.log("📥 Raw API response status:", response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error("❌ API Error:", errorData);
            throw new Error(`API returned ${response.status}: ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        console.log("✨ API response data:", data);

        if (!data.choices || !data.choices[0]?.message?.content) {
            console.error("❌ Invalid API response structure:", data);
            throw new Error("Invalid response structure from OpenAI API");
        }

        const parsedContent = JSON.parse(data.choices[0].message.content);
        console.log("🎯 Parsed content:", parsedContent);

        // Validate the returned date and time in user's timezone
        const returnedDateTime = new Date(`${parsedContent.date}T${parsedContent.startTime}`);
        const nowInUserTZ = new Date(new Date().toLocaleString("en-US", { timeZone: userTimeZone }));
        const tomorrowInUserTZ = new Date(nowInUserTZ);
        tomorrowInUserTZ.setDate(tomorrowInUserTZ.getDate() + 1);

        // Only move to tomorrow if the time is more than 24 hours in the past
        const twentyFourHoursAgo = new Date(nowInUserTZ);
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

        if (returnedDateTime < twentyFourHoursAgo) {
            console.warn("⚠️ Event time is more than 24 hours in the past, moving to tomorrow");
            parsedContent.date = tomorrowInUserTZ.toLocaleDateString('en-CA');
        }

        // Add timezone to the response for reference
        parsedContent.timeZone = userTimeZone;

        return parsedContent;

    } catch (error) {
        console.error('💥 GPT parsing error:', error);
        console.error('Stack trace:', error.stack);
        throw error;
    }
}

// Log when background script loads
console.log("🚀 Background script loaded");
