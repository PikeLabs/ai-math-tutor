import React, { useState, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PDFViewer from './PDFViewer';
import TTSService from './TTSService';
import Avatar from './Avatar';
import Feedback from './Feedback';
import './App.css';

const AppContext = createContext();

function ChatApp() {
  const { 
    messages, setMessages, selectedAssignment, setSelectedAssignment,
    isRecording, isPaused, startRecording, stopRecording, pauseRecording, resumeRecording,
    audioBlob, recordingTime, formatTime, currentRecordingSegment,
    interventionState, questionsAsked, handleInterventionResponse, slideTimestamps
  } = useContext(AppContext);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [avatarState, setAvatarState] = useState({ isLoading: false, isSpeaking: false });
  const [feedbackGenerated, setFeedbackGenerated] = useState(false);

  // Set up TTS service listeners for avatar state
  React.useEffect(() => {
    const handleTTSStateChange = (state) => {
      console.log('Avatar state update:', state);
      setAvatarState(state);
    };

    TTSService.addListener(handleTTSStateChange);

    return () => {
      TTSService.removeListener(handleTTSStateChange);
      TTSService.stop();
    };
  }, []);

  const stopCurrentAudio = () => {
    TTSService.stop();
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = { role: 'user', content: inputMessage };
    setMessages(prev => [...prev, userMessage]);
    const messageContent = inputMessage;
    setInputMessage('');
    console.log('Setting isLoading to true for processing');
    setIsLoading(true);

    try {
      // Check if we're in an intervention and should handle it specially
      if (interventionState === 'questioning') {
        await handleInterventionResponse(messageContent);
        setIsLoading(false);
        return;
      }

      // Normal chat flow (when not in intervention)
      const response = await fetch('http://localhost:5001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: [...messages, userMessage],
          selectedAssignment: selectedAssignment
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        const aiMessage = { role: 'assistant', content: data.response };
        setMessages(prev => [...prev, aiMessage]);
        
        // Trigger TTS for AI response
        TTSService.speak(data.response);
      } else {
        const errorMessage = { role: 'assistant', content: `Error: ${data.error}` };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      const errorMessage = { role: 'assistant', content: `Error: ${error.message}` };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const generateFeedback = async () => {
    if (!messages.length) return;
    
    setIsLoading(true);
    try {
      // Get the latest recording from the context
      const recordingBlob = currentRecordingSegment;
      
      // Get PDF session ID and slide count from localStorage
      const pdfSessionId = localStorage.getItem('currentPDFSession');
      const pdfSlideCount = localStorage.getItem('currentPDFSlideCount');
      console.log('📄 Using PDF session ID:', pdfSessionId);
      console.log('📄 Using PDF slide count:', pdfSlideCount);
      
      if (recordingBlob) {
        // Send with recording as multipart form data
        const formData = new FormData();
        formData.append('messages', JSON.stringify(messages));
        formData.append('selectedAssignment', selectedAssignment || '');
        formData.append('recording', recordingBlob, 'presentation.wav');
        formData.append('slideTimestamps', JSON.stringify(slideTimestamps));
        formData.append('pdfSessionId', pdfSessionId || '');
        formData.append('pdfSlideCount', pdfSlideCount || '');
        
        const response = await fetch('http://localhost:5001/api/feedback', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
          console.log('Feedback response:', data);
          if (data.session_id || data.slides || data.feedback) {
            // New structured format or legacy format
            const feedbackToStore = data.feedback || JSON.stringify(data);
            localStorage.setItem('pitchFeedback', feedbackToStore);
            setFeedbackGenerated(true);
            alert('Feedback generated! Navigate to /feedback to view it.');
          } else {
            alert('Error: No feedback received from server');
          }
        } else {
          console.error('Feedback error:', data);
          alert(`Error generating feedback: ${data.error || 'Unknown error'}`);
        }
      } else {
        // Send without recording as JSON
        const response = await fetch('http://localhost:5001/api/feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: messages,
            selectedAssignment: selectedAssignment || '',
            pdfSessionId: pdfSessionId || '',
            pdfSlideCount: pdfSlideCount || ''
          })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          console.log('Feedback response (no recording):', data);
          if (data.session_id || data.slides || data.feedback) {
            // New structured format or legacy format
            const feedbackToStore = data.feedback || JSON.stringify(data);
            localStorage.setItem('pitchFeedback', feedbackToStore);
            setFeedbackGenerated(true);
            alert('Feedback generated! Navigate to /feedback to view it.');
          } else {
            alert('Error: No feedback received from server');
          }
        } else {
          console.error('Feedback error (no recording):', data);
          alert(`Error generating feedback: ${data.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Feedback generation error:', error);
      alert(`Error generating feedback: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="chat-panel-container">
            <Avatar 
              isSpeaking={avatarState.isSpeaking} 
              isLoading={avatarState.isLoading}
              isProcessing={isLoading}
            />
            <div className="chat-container">
              <div className="chat-header">
                <h1>VC Mentor</h1>
              {interventionState === 'questioning' && (
                <div className="intervention-status">
                  <span className="intervention-indicator">💬</span>
                  <span className="intervention-text">VC Questions ({questionsAsked}/2)</span>
                </div>
              )}
              {interventionState === 'complete' && (
                <div className="intervention-status complete">
                  <span className="intervention-indicator">✅</span>
                  <span className="intervention-text">Questions Complete - Continue Presentation</span>
                  {!feedbackGenerated && (
                    <button 
                      onClick={generateFeedback} 
                      disabled={isLoading}
                      className="generate-feedback-btn"
                      style={{marginLeft: '10px', padding: '5px 10px', fontSize: '12px'}}
                    >
                      {isLoading ? 'Generating...' : 'Generate Feedback'}
                    </button>
                  )}
                  {feedbackGenerated && (
                    <span style={{marginLeft: '10px', color: 'green', fontSize: '12px'}}>
                      Feedback ready at /feedback
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div className="chat-messages">
              {messages.map((message, index) => (
                <div key={index} className={`message ${message.role}`}>
                  <div className="message-content">
                    {message.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message assistant">
                  <div className="message-content">
                    Thinking...
                  </div>
                </div>
              )}
            </div>
            
            <div className="chat-input">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Tell me about your startup challenge..."
                disabled={isLoading}
              />
              <div className="input-controls">
                <button onClick={sendMessage} disabled={isLoading || !inputMessage.trim()}>
                  Send
                </button>
                <button 
                  onClick={stopCurrentAudio} 
                  disabled={!avatarState.isSpeaking}
                  className="stop-speech-btn"
                  title="Stop speech"
                >
                  🔇
                </button>
              </div>
            </div>
            </div>
    </div>
  );
}


function App() {
  const [messages, setMessages] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState('');
  
  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingTimer, setRecordingTimer] = useState(null);
  const [currentRecordingSegment, setCurrentRecordingSegment] = useState(null);
  
  // Intervention state management
  const [interventionState, setInterventionState] = useState('inactive'); // 'inactive' | 'questioning' | 'complete'
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [currentSlideRange, setCurrentSlideRange] = useState(null);
  const [autoUnlockReady, setAutoUnlockReady] = useState(false);
  
  // Slide timestamp tracking
  const [slideTimestamps, setSlideTimestamps] = useState([]);
  
  // Audio recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const audioChunks = [];

      recorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        setCurrentRecordingSegment(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      // Start timer
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      setRecordingTimer(timer);
      
      console.log('Recording started');
    } catch (error) {
      alert('Error accessing microphone: ' + error.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && (isRecording || isPaused)) {
      mediaRecorder.stop();
      setIsRecording(false);
      setIsPaused(false);
      setMediaRecorder(null);
      
      if (recordingTimer) {
        clearInterval(recordingTimer);
        setRecordingTimer(null);
      }
      
      console.log('Recording stopped');
    }
  };

  // Function to stop recording and return the resulting blob
  const getLatestRecording = () => {
    return new Promise((resolve) => {
      if (mediaRecorder && (isRecording || isPaused)) {
        console.log('🎵 Preparing to capture recording...');
        
        // We need to collect the audio chunks ourselves since we're overriding onstop
        const audioChunks = [];
        
        // Override the data handler temporarily
        const originalOnDataAvailable = mediaRecorder.ondataavailable;
        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
          // Also call original handler if it exists
          if (originalOnDataAvailable) {
            originalOnDataAvailable(event);
          }
        };
        
        // Set up a temporary handler for when recording stops
        const originalOnStop = mediaRecorder.onstop;
        mediaRecorder.onstop = (event) => {
          console.log('🎵 Recording stopped, creating blob...');
          
          // Create the blob from our captured chunks
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          console.log('🎵 Blob created:', audioBlob, 'Size:', audioBlob.size);
          
          // Call the original handler to update state
          if (originalOnStop) {
            originalOnStop(event);
          }
          
          // Resolve with the fresh blob
          resolve(audioBlob);
        };
        
        // Stop the recording
        mediaRecorder.stop();
        setIsRecording(false);
        setIsPaused(false);
        
        if (recordingTimer) {
          clearInterval(recordingTimer);
          setRecordingTimer(null);
        }
      } else {
        console.log('🎵 No active recording, using existing segment');
        // No active recording, return existing segment
        resolve(currentRecordingSegment);
      }
    });
  };
  
  const pauseRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.pause();
      setIsPaused(true);
      
      if (recordingTimer) {
        clearInterval(recordingTimer);
        setRecordingTimer(null);
      }
      
      console.log('Recording paused');
    }
  };
  
  const resumeRecording = () => {
    if (mediaRecorder && isPaused) {
      mediaRecorder.resume();
      setIsPaused(false);
      
      // Resume timer
      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      setRecordingTimer(timer);
      
      console.log('Recording resumed');
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Handle slide lock triggering recording pause
  const handleSlideLockTriggered = (slideNumber, recordingBlob = null) => {
    // Use provided recording blob or fallback to current recording segment
    const audioData = recordingBlob || currentRecordingSegment;
    
    // Only pause if we don't have a recording blob (meaning recording wasn't already stopped)
    if (!recordingBlob && isRecording && !isPaused) {
      pauseRecording();
    }
    
    // Calculate the slide range that was just presented
    const slideRange = calculatePresentedSlideRange(slideNumber);
    console.log(`Recording handled for slide ${slideNumber} lock`);
    console.log(`Slide range just presented: ${slideRange.start}-${slideRange.end}`);
    console.log(`Audio data provided: ${!!audioData}`);
    
    // Start intervention session
    setInterventionState('questioning');
    setQuestionsAsked(0);
    setCurrentSlideRange(slideRange);
    setAutoUnlockReady(false);
    
    // Trigger AI intervention with context and recording
    handleAIIntervention(slideRange, audioData);
  };
  
  // Handle user responses during intervention
  const handleInterventionResponse = async (userMessage) => {
    if (interventionState === 'questioning' && questionsAsked < 2) {
      // User answered a question - check if we should ask another
      if (questionsAsked === 0) {
        // Ask second question
        setQuestionsAsked(1);
        await generateFollowUpQuestion(userMessage);
      } else if (questionsAsked === 1) {
        // Two questions completed - prepare for auto-unlock
        setQuestionsAsked(2);
        setInterventionState('complete');
        setAutoUnlockReady(true);
        
        // Add a system message indicating the session is complete
        const completionMessage = { 
          role: 'assistant', 
          content: "Thanks for those answers! You can continue with your presentation now." 
        };
        setMessages(prev => [...prev, completionMessage]);
        
        // Trigger TTS for completion message
        TTSService.speak(completionMessage.content);
        
        console.log('Intervention complete - auto-unlock ready');
      }
    }
  };
  
  const calculatePresentedSlideRange = (lockSlide) => {
    // Lock triggers when trying to advance FROM the lock slide
    // So if locked at slide 2, they just presented slides 1-2
    // If locked at slide 4, they just presented slides 3-4, etc.
    const end = lockSlide;
    const start = lockSlide === 2 ? 1 : lockSlide - 1; // First range is 1-2, then 3-4, 5-6, etc.
    
    return { start, end };
  };
  
  const handleAIIntervention = async (slideRange, audioSegment) => {
    try {
      console.log(`AI Intervention triggered for slides ${slideRange.start}-${slideRange.end}`);
      
      if (!selectedAssignment) {
        console.error('No assignment selected for AI intervention');
        return;
      }
      
      // Extract slide content for the specific range
      const slideResponse = await fetch(`http://localhost:5001/api/assignments/${selectedAssignment}/slides`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          start_slide: slideRange.start,
          end_slide: slideRange.end
        })
      });
      
      if (!slideResponse.ok) {
        throw new Error('Failed to fetch slide content');
      }
      
      const slideData = await slideResponse.json();
      console.log('Extracted slide content:', slideData);
      
      // Build enhanced context and send to AI
      await generateVCQuestion(slideData, slideRange, audioSegment);
      
    } catch (error) {
      console.error('AI Intervention failed:', error);
    }
  };
  
  const generateVCQuestion = async (slideData, slideRange, audioSegment) => {
    try {
      console.log('🎯 Generating VC Question...');
      console.log('🎵 Audio segment received:', audioSegment);
      console.log('📊 Audio segment type:', audioSegment?.constructor?.name);
      console.log('📏 Audio segment size:', audioSegment?.size, 'bytes');
      
      // Build the enhanced context message with our existing VC prompt structure
      const contextMessage = buildEnhancedContext(slideData, slideRange, audioSegment, 1);
      
      // Create a temporary message list with just this intervention
      const interventionMessages = [
        { role: 'user', content: contextMessage }
      ];
      
      let response;
      
      // If we have an audio segment, send as multipart form data
      if (audioSegment && audioSegment instanceof Blob) {
        console.log('🚀 Sending audio data to backend as multipart form...');
        const formData = new FormData();
        formData.append('messages', JSON.stringify(interventionMessages));
        formData.append('selectedAssignment', selectedAssignment);
        formData.append('audio', audioSegment, 'recording.wav');
        
        response = await fetch('http://localhost:5001/api/chat', {
          method: 'POST',
          body: formData
        });
      } else {
        console.log('⚠️ No audio segment found, sending without audio...');
        // Send regular JSON request without audio
        response = await fetch('http://localhost:5001/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            messages: interventionMessages,
            selectedAssignment: selectedAssignment
          }),
        });
      }
      
      const data = await response.json();
      
      if (response.ok) {
        // Add the AI's first VC question to the chat automatically
        const aiQuestion = { role: 'assistant', content: data.response };
        setMessages(prev => [...prev, aiQuestion]);
        
        // Trigger TTS for AI intervention question
        TTSService.speak(data.response);
        
        // Don't increment questionsAsked here - it gets incremented in handleInterventionResponse
        console.log('AI VC Question 1 generated:', data.response);
      } else {
        console.error('Failed to generate VC question:', data.error);
      }
      
    } catch (error) {
      console.error('Failed to generate VC question:', error);
    }
  };
  
  const generateFollowUpQuestion = async (userResponse) => {
    try {
      // Build context for follow-up question
      const followUpContext = buildFollowUpContext(userResponse);
      
      // Create messages including the conversation so far
      const conversationMessages = [
        ...messages, // Include previous conversation
        { role: 'user', content: followUpContext }
      ];
      
      const response = await fetch('http://localhost:5001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          messages: conversationMessages,
          selectedAssignment: selectedAssignment
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        const followUpQuestion = { role: 'assistant', content: data.response };
        setMessages(prev => [...prev, followUpQuestion]);
        
        // Trigger TTS for follow-up question
        TTSService.speak(data.response);
        
        console.log('AI Follow-up Question generated:', data.response);
      } else {
        console.error('Failed to generate follow-up question:', data.error);
      }
      
    } catch (error) {
      console.error('Failed to generate follow-up question:', error);
    }
  };
  
  const buildEnhancedContext = (slideData, slideRange, audioSegment, questionNumber) => {
    // Build the context message that preserves our great VC prompt while adding the new information
    let contextMessage = `CONTEXT FOR THIS INTERVENTION (Question ${questionNumber} of 2):\n`;
    contextMessage += `- Full pitch deck: Available (${selectedAssignment})\n`;
    contextMessage += `- Founder just presented: Slides ${slideRange.start}-${slideRange.end}\n\n`;
    
    contextMessage += `SLIDES CONTENT:\n${slideData.focused_content}\n\n`;
    
    if (audioSegment) {
      contextMessage += `FOUNDER'S PRESENTATION: [Audio recorded but not yet transcribed]\n\n`;
    }
    
    contextMessage += `I just finished presenting slides ${slideRange.start}-${slideRange.end} of my pitch deck. Ask me one specific VC-style question about these slides.`;
    
    return contextMessage;
  };
  
  const buildFollowUpContext = (userResponse) => {
    return `Based on my previous answer, ask me one final follow-up question about slides ${currentSlideRange.start}-${currentSlideRange.end}. This is question 2 of 2.`;
  };
  
  const handleSlideAdvance = () => {
    // Called when user advances slides after auto-unlock
    if (interventionState === 'complete' && isPaused) {
      // Reset intervention state and resume recording
      setInterventionState('inactive');
      setQuestionsAsked(0);
      setCurrentSlideRange(null);
      setAutoUnlockReady(false);
      
      // Resume recording automatically
      resumeRecording();
      console.log('Recording resumed after intervention completion');
    }
  };

  return (
    <AppContext.Provider value={{ 
      messages, setMessages, selectedAssignment, setSelectedAssignment,
      isRecording, isPaused, startRecording, stopRecording, pauseRecording, resumeRecording,
      audioBlob, recordingTime, formatTime, currentRecordingSegment,
      interventionState, questionsAsked, autoUnlockReady, handleInterventionResponse,
      slideTimestamps
    }}>
      <Router>
        <Routes>
          <Route path="/" element={
            <div className="App">
              <div className="split-screen-container">
                <div className="pdf-panel">
                  <PDFViewer 
                    onAssignmentChange={setSelectedAssignment} 
                    onSlideLockTriggered={handleSlideLockTriggered}
                    autoUnlockReady={autoUnlockReady}
                    onSlideAdvance={handleSlideAdvance}
                    currentRecordingSegment={currentRecordingSegment}
                    isRecording={isRecording}
                    isPaused={isPaused}
                    startRecording={startRecording}
                    stopRecording={stopRecording}
                    pauseRecording={pauseRecording}
                    resumeRecording={resumeRecording}
                    recordingTime={recordingTime}
                    formatTime={formatTime}
                    getLatestRecording={getLatestRecording}
                    onSlideTimestampsChange={setSlideTimestamps}
                  />
                </div>
                
                <div className="chat-panel">
                  <ChatApp />
                </div>
              </div>
            </div>
          } />
          <Route path="/feedback" element={<Feedback />} />
        </Routes>
      </Router>
    </AppContext.Provider>
  );
}

export default App;