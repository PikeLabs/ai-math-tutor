import React from 'react';
import './Avatar.css';
import professorImage from './assets/shepheadshot.jpeg';

function Avatar({ isSpeaking = false, isLoading = false, isProcessing = false }) {
  console.log('Avatar props:', { isSpeaking, isLoading, isProcessing });
  return (
    <div className="avatar-container">
      <div className={`avatar ${isSpeaking ? 'speaking' : ''} ${isLoading ? 'loading' : ''} ${isProcessing ? 'processing' : ''}`}>
        <img 
          src={professorImage} 
          alt="Professor" 
          className="avatar-image"
        />
        {isSpeaking && <div className="speaking-ring"></div>}
        {isLoading && <div className="loading-ring"></div>}
        {isProcessing && <div className="processing-ring"></div>}
      </div>
    </div>
  );
}

export default Avatar;