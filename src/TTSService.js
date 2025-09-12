class TTSService {
	constructor() {
		this.currentAudio = null;
		this.apiKey =
			process.env.REACT_APP_ELEVENLABS_API_KEY || "your-api-key-here";
		this.voiceId =
			process.env.REACT_APP_ELEVENLABS_VOICE_ID || "b49kxxWbYzfNv7AZOp3g";
		this.baseUrl = "https://api.elevenlabs.io/v1";
		this.isLoading = false;
		this.isSpeaking = false;
		this.listeners = new Set();

		// Recording capabilities
		this.recordingData = null;
	}

	// Method to set recording data from App component
	setRecordingData(audioBlob) {
		this.recordingData = audioBlob;
	}

	// Method to get recording data
	getRecordingData() {
		return this.recordingData;
	}

	// Method to clear recording data
	clearRecordingData() {
		this.recordingData = null;
	}

	async speak(text) {
		try {
			// Stop any currently playing audio
			this.stop();

			// Clean text for TTS (remove markdown and math notation)
			const cleanText = this.cleanTextForTTS(text);

			if (!cleanText.trim()) {
				return;
			}

			// Set loading state
			this.isLoading = true;
			this.isSpeaking = false;
			this.notifyListeners();

			const response = await fetch(
				`${this.baseUrl}/text-to-speech/${this.voiceId}`,
				{
					method: "POST",
					headers: {
						Accept: "audio/mpeg",
						"Content-Type": "application/json",
						"xi-api-key": this.apiKey,
					},
					body: JSON.stringify({
						text: cleanText,
						model_id: "eleven_monolingual_v1",
						voice_settings: {
							stability: 0.5,
							similarity_boost: 0.5,
						},
					}),
				}
			);

			if (!response.ok) {
				throw new Error(`ElevenLabs API error: ${response.status}`);
			}

			const audioBlob = await response.blob();
			const audioUrl = URL.createObjectURL(audioBlob);

			this.currentAudio = new Audio(audioUrl);

			// Set up event listeners
			this.currentAudio.addEventListener("canplay", () => {
				this.isLoading = false;
				this.isSpeaking = true;
				this.notifyListeners();
			});

			this.currentAudio.addEventListener("play", () => {
				this.isLoading = false;
				this.isSpeaking = true;
				this.notifyListeners();
			});

			this.currentAudio.addEventListener("ended", () => {
				URL.revokeObjectURL(audioUrl);
				this.currentAudio = null;
				this.isSpeaking = false;
				this.notifyListeners();
			});

			this.currentAudio.addEventListener("error", (e) => {
				console.error("Audio playback error:", e);
				URL.revokeObjectURL(audioUrl);
				this.currentAudio = null;
				this.isLoading = false;
				this.isSpeaking = false;
				this.notifyListeners();
			});

			// Auto-play the audio
			await this.currentAudio.play();
		} catch (error) {
			console.error("TTS Error:", error);
			this.isLoading = false;
			this.isSpeaking = false;
			this.notifyListeners();
		}
	}

	stop() {
		if (this.currentAudio) {
			this.currentAudio.pause();
			this.currentAudio.currentTime = 0;
			this.currentAudio = null;
		}
		this.isLoading = false;
		this.isSpeaking = false;
		this.notifyListeners();
	}

	// Event listener management
	addListener(callback) {
		this.listeners.add(callback);
	}

	removeListener(callback) {
		this.listeners.delete(callback);
	}

	notifyListeners() {
		this.listeners.forEach((callback) => {
			callback({
				isLoading: this.isLoading,
				isSpeaking: this.isSpeaking,
			});
		});
	}

	// Getter methods for current state
	getIsLoading() {
		return this.isLoading;
	}

	getIsSpeaking() {
		return this.isSpeaking;
	}

	cleanTextForTTS(text) {
		return (
			text
				// Remove LaTeX math expressions
				.replace(/\$\$[\s\S]*?\$\$/g, " math expression ")
				.replace(/\$[^$]*?\$/g, " math ")
				// Remove markdown formatting
				.replace(/\*\*(.*?)\*\*/g, "$1")
				.replace(/\*(.*?)\*/g, "$1")
				.replace(/`(.*?)`/g, "$1")
				.replace(/#{1,6}\s+(.*)/g, "$1")
				// Remove code blocks
				.replace(/```[\s\S]*?```/g, " code block ")
				// Clean up multiple spaces and newlines
				.replace(/\s+/g, " ")
				.trim()
		);
	}
}

export default new TTSService();
