document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const chatContainer = document.getElementById('chat-container');

    fileInput.addEventListener('change', handleFileSelect);

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const chatData = JSON.parse(e.target.result);
                displayChat(chatData);
            } catch (error) {
                alert('Error parsing JSON file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    function displayChat(chatData) {
        chatContainer.innerHTML = ''; // Clear previous chat

        const userProfile = chatData.profile || 'User';
        let lastSpeaker = null;

        chatData.messages.forEach(msg => {
            let speaker = null;
            let content = msg.content;
            let isUserMessage = false;

            const match = content.match(/^\[([^\]]+)\]:\s*/);
            
            if (match) {
                // Message has a speaker tag like [Name]:
                speaker = match[1];
                content = content.substring(match[0].length);
                isUserMessage = false;
                lastSpeaker = speaker;
            } else {
                // Message does NOT have a speaker tag.
                // This could be a user message OR a continuation from the last speaker.
                // Based on the sample, messages like "나 꿔누연은 잘생김" are from the user.
                // And messages like "아침부터 왜 그래?" are continuations.
                // The current data structure makes it ambiguous.
                // We will treat all messages without a prefix as being from the last speaker, 
                // unless no one has spoken yet, in which case it is the user.
                if(lastSpeaker) {
                    speaker = lastSpeaker;
                    isUserMessage = (speaker === userProfile);
                } else {
                    speaker = userProfile;
                    isUserMessage = true;
                    lastSpeaker = userProfile;
                }
            }

            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            
            if (isUserMessage) {
                messageElement.classList.add('user-message');
            } else {
                messageElement.classList.add('assistant-message');
            }

            const senderElement = document.createElement('div');
            senderElement.classList.add('sender');
            
            // Show sender name only for the first message of a sequence from an assistant
            if (!isUserMessage && speaker !== lastSpeaker) {
                 senderElement.textContent = speaker;
            }


            const contentElement = document.createElement('div');
            contentElement.classList.add('content');
            contentElement.textContent = content.trim();
            
            // Only add sender element if it has content
            if (senderElement.textContent) {
                 messageElement.appendChild(senderElement);
            }
            messageElement.appendChild(contentElement);
            chatContainer.appendChild(messageElement);
        });

        // Scroll to the bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
});
