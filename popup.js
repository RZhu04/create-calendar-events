document.getElementById("create-event-btn").addEventListener("click", async () => {
    const loadingText = document.getElementById("loading-text");
    const statusDiv = document.getElementById("status");
    const createButton = document.getElementById("create-event-btn");

    // Show loading state
    loadingText.classList.add("active");
    createButton.disabled = true;
    statusDiv.textContent = "";

    const userInput = document.getElementById("event-input").value;
    console.log("🎯 Raw user input:", userInput);

    if (!userInput) {
        alert("Please enter event details.");
        return;
    }

    try {
        console.log("🔄 Sending to GPT for parsing...");
        
        // First, parse the event using GPT
        const parseResponse = await new Promise(resolve => {
            chrome.runtime.sendMessage(
                { action: "parseEvent", input: userInput },
                resolve
            );
        });

        console.log("📥 GPT Response:", parseResponse);

        if (!parseResponse.success) {
            console.error("❌ GPT parsing failed:", parseResponse.error);
            throw new Error(parseResponse.error);
        }

        const parsedEvent = parseResponse.data;
        console.log("✨ Parsed event data:", parsedEvent);

        // Convert to event details format
        const startDate = new Date(`${parsedEvent.date}T${parsedEvent.startTime}`);
        const endDate = new Date(`${parsedEvent.date}T${parsedEvent.endTime}`);

        console.log("🕒 Start time:", startDate.toLocaleString());
        console.log("🕒 End time:", endDate.toLocaleString());

        // Create the event details with proper datetime format
        const eventDetails = {
            summary: parsedEvent.summary,
            start: {
                dateTime: new Date(`${parsedEvent.date}T${parsedEvent.startTime}`).toISOString(),
                timeZone: parsedEvent.timeZone
            },
            end: {
                dateTime: new Date(`${parsedEvent.date}T${parsedEvent.endTime}`).toISOString(),
                timeZone: parsedEvent.timeZone
            }
        };

        console.log("📅 Final event details:", eventDetails);

        // Create the event
        console.log("📤 Sending create event request...");
        chrome.runtime.sendMessage({ action: "createEvent", eventDetails }, (response) => {
            if (response.success) {
                console.log("✅ Event created successfully!");
                loadingText.classList.remove("active");
                createButton.disabled = false;
                statusDiv.textContent = "Event Created!";
                statusDiv.className = "success";
                document.getElementById("event-input").value = "";
            } else {
                console.error("❌ Failed to create event:", response);
                loadingText.classList.remove("active");
                createButton.disabled = false;
                statusDiv.textContent = "Error creating event.";
                statusDiv.className = "error";
            }
        });
    } catch (error) {
        console.error("💥 Error in event creation:", error);
        console.error("Stack trace:", error.stack);
        alert("Could not understand the input. Please try again.");
        loadingText.classList.remove("active");
        createButton.disabled = false;
    }
});

// Log when popup is loaded
console.log("🚀 Calendar Event Creator popup loaded");
