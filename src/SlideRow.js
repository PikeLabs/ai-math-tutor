import React, { useState } from 'react';

function SlideRow({ slideData, onImageClick }) {
  const [audioError, setAudioError] = useState(false);
  const [imageError, setImageError] = useState(false);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'met':
        return '✓';
      case 'not_met':
        return '✗';
      case 'not_applicable':
        return 'N/A';
      default:
        return '?';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'met':
        return '#27ae60';
      case 'not_met':
        return '#e74c3c';
      case 'not_applicable':
        return '#7f8c8d';
      default:
        return '#95a5a6';
    }
  };

  const handleImageError = () => {
    setImageError(true);
  };

  const handleAudioError = () => {
    setAudioError(true);
  };

  const renderFeedbackItem = (label, feedbackItem) => {
    return (
      <div style={{
        marginBottom: '8px',
        padding: '8px',
        backgroundColor: '#fff',
        borderRadius: '4px',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{
          fontWeight: 'bold',
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center'
        }}>
          <span style={{ color: '#2c3e50', marginRight: '8px' }}>{label}:</span>
          <span style={{
            color: getStatusColor(feedbackItem.status),
            fontSize: '16px',
            fontWeight: 'bold'
          }}>
            {getStatusIcon(feedbackItem.status)}
          </span>
        </div>
        <div style={{
          color: '#555',
          fontSize: '13px',
          lineHeight: '1.4'
        }}>
          {feedbackItem.comment}
        </div>
      </div>
    );
  };

  return (
    <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
      {/* Column 1: Slide Image */}
      <td style={{
        padding: '15px',
        verticalAlign: 'top',
        width: '200px',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#2c3e50' }}>
          Slide {slideData.slide_number}
        </div>
        {!imageError ? (
          <img
            src={`http://localhost:5001${slideData.image_url}`}
            alt={`Slide ${slideData.slide_number}`}
            style={{
              maxWidth: '180px',
              maxHeight: '120px',
              border: '2px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'border-color 0.2s'
            }}
            onClick={() => onImageClick(`http://localhost:5001${slideData.image_url_full}`, slideData.slide_number)}
            onError={handleImageError}
            onMouseOver={(e) => e.target.style.borderColor = '#3498db'}
            onMouseOut={(e) => e.target.style.borderColor = '#ddd'}
          />
        ) : (
          <div style={{
            width: '180px',
            height: '120px',
            border: '2px dashed #ccc',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '12px'
          }}>
            Slide image not available
          </div>
        )}
        <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
          Click to view full size
        </div>
      </td>

      {/* Column 2: Feedback */}
      <td style={{
        padding: '15px',
        verticalAlign: 'top',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ marginBottom: '10px', fontWeight: 'bold', color: '#2c3e50' }}>
          Learning Objectives
        </div>
        {slideData.feedback ? (
          <>
            {renderFeedbackItem('Content Structuring', slideData.feedback.content_structuring || {status: 'unknown', comment: 'No feedback available'})}
            {renderFeedbackItem('Delivery', slideData.feedback.delivery || {status: 'unknown', comment: 'No feedback available'})}
            {renderFeedbackItem('Impromptu Response', slideData.feedback.impromptu_response || {status: 'not_applicable', comment: 'Evaluated in Q&A section'})}
            {renderFeedbackItem('Composure', slideData.feedback.composure || {status: 'not_applicable', comment: 'Evaluated in Q&A section'})}
          </>
        ) : (
          <div style={{ color: '#666', fontStyle: 'italic' }}>
            No feedback data available for this slide
          </div>
        )}
      </td>

      {/* Column 3: Audio Player */}
      <td style={{
        padding: '15px',
        verticalAlign: 'top',
        width: '200px',
        textAlign: 'center'
      }}>
        <div style={{ marginBottom: '10px', fontWeight: 'bold', color: '#2c3e50' }}>
          Audio Segment
        </div>
        {slideData.audio_url && !audioError ? (
          <div>
            <audio
              controls
              style={{
                width: '100%',
                maxWidth: '180px'
              }}
              onError={handleAudioError}
            >
              <source src={`http://localhost:5001${slideData.audio_url}`} type="audio/wav" />
              Your browser does not support the audio element.
            </audio>
            <div style={{ marginTop: '5px', fontSize: '11px', color: '#666' }}>
              Audio for this slide
            </div>
          </div>
        ) : (
          <div style={{
            width: '180px',
            height: '40px',
            border: '1px dashed #ccc',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: '12px',
            margin: '0 auto'
          }}>
            {audioError ? 'Audio not available' : 'No audio segment'}
          </div>
        )}
      </td>
    </tr>
  );
}

export default SlideRow;