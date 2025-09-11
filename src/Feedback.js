import React, { useState, useEffect } from 'react';
import SlideRow from './SlideRow';
import SlideModal from './SlideModal';

function Feedback() {
  const [feedbackData, setFeedbackData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalImage, setModalImage] = useState(null);
  const [modalSlideNumber, setModalSlideNumber] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    // Get feedback from localStorage
    const storedFeedback = localStorage.getItem('pitchFeedback');
    
    if (storedFeedback) {
      try {
        // Try to parse as JSON (new format)
        const parsedFeedback = JSON.parse(storedFeedback);
        if (parsedFeedback.slides) {
          setFeedbackData(parsedFeedback);
        } else {
          // Old format - convert to new format for display
          setFeedbackData({
            feedback_type: 'legacy',
            slides: [],
            qa_feedback: null,
            legacy_text: storedFeedback
          });
        }
      } catch (e) {
        // Old text format
        setFeedbackData({
          feedback_type: 'legacy',
          slides: [],
          qa_feedback: null,
          legacy_text: storedFeedback
        });
      }
    } else {
      setFeedbackData(null);
    }
    
    setLoading(false);
  }, []);

  const goBack = () => {
    window.history.back();
  };

  const loadTestFeedback = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/feedback/test');
      const data = await response.json();
      if (data.feedback) {
        // This is old format
        const legacyData = {
          feedback_type: 'legacy',
          slides: [],
          qa_feedback: null,
          legacy_text: data.feedback
        };
        localStorage.setItem('pitchFeedback', JSON.stringify(legacyData));
        setFeedbackData(legacyData);
      }
    } catch (error) {
      console.error('Error loading test feedback:', error);
    }
  };

  const handleImageClick = (imageUrl, slideNumber) => {
    setModalImage(imageUrl);
    setModalSlideNumber(slideNumber);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalImage(null);
    setModalSlideNumber(null);
  };

  const renderQAFeedback = (qaFeedback) => {
    if (!qaFeedback) return null;

    const getStatusIcon = (status) => {
      switch (status) {
        case 'met': return '✓';
        case 'not_met': return '✗';
        case 'not_applicable': return 'N/A';
        default: return '?';
      }
    };

    const getStatusColor = (status) => {
      switch (status) {
        case 'met': return '#27ae60';
        case 'not_met': return '#e74c3c';
        case 'not_applicable': return '#7f8c8d';
        default: return '#95a5a6';
      }
    };

    return (
      <div style={{
        marginTop: '30px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef'
      }}>
        <h3 style={{ 
          color: '#2c3e50', 
          borderBottom: '2px solid #3498db', 
          paddingBottom: '8px',
          marginBottom: '15px'
        }}>
          Q&A Session Feedback
        </h3>
        
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <div style={{
            flex: '1',
            minWidth: '300px',
            padding: '15px',
            backgroundColor: '#fff',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#2c3e50', marginRight: '10px' }}>Impromptu Response:</span>
              <span style={{
                color: getStatusColor(qaFeedback.impromptu_response.status),
                fontSize: '18px',
                fontWeight: 'bold'
              }}>
                {getStatusIcon(qaFeedback.impromptu_response.status)}
              </span>
            </div>
            <div style={{ color: '#555', lineHeight: '1.4', fontSize: '14px' }}>
              {qaFeedback.impromptu_response.comment}
            </div>
          </div>

          <div style={{
            flex: '1',
            minWidth: '300px',
            padding: '15px',
            backgroundColor: '#fff',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#2c3e50', marginRight: '10px' }}>Composure:</span>
              <span style={{
                color: getStatusColor(qaFeedback.composure.status),
                fontSize: '18px',
                fontWeight: 'bold'
              }}>
                {getStatusIcon(qaFeedback.composure.status)}
              </span>
            </div>
            <div style={{ color: '#555', lineHeight: '1.4', fontSize: '14px' }}>
              {qaFeedback.composure.comment}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderLegacyFeedback = (legacyText) => {
    return (
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '30px',
        borderRadius: '8px',
        border: '1px solid #e9ecef',
        fontSize: '16px',
        color: '#333',
        whiteSpace: 'pre-line'
      }}>
        {legacyText}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h1>Loading Feedback...</h1>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '20px', 
      fontFamily: 'Arial, sans-serif',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={goBack}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px',
            marginRight: '10px'
          }}
        >
          ← Back to Chat
        </button>
        <button 
          onClick={loadTestFeedback}
          style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Load Test Feedback
        </button>
      </div>
      
      <h1 style={{ color: '#333', marginBottom: '30px', textAlign: 'center' }}>
        Pitch Feedback Report
      </h1>
      
      {!feedbackData ? (
        <div style={{
          backgroundColor: '#fff',
          padding: '40px',
          borderRadius: '8px',
          border: '1px solid #e9ecef',
          textAlign: 'center',
          color: '#666'
        }}>
          No feedback available. Please complete a VC conversation and generate feedback first.
        </div>
      ) : feedbackData.feedback_type === 'legacy' ? (
        // Legacy text format
        <div>
          <div style={{
            backgroundColor: '#fff9c4',
            padding: '15px',
            borderRadius: '6px',
            border: '1px solid #f7e806',
            marginBottom: '20px',
            color: '#8a6d00'
          }}>
            📝 This is legacy feedback format. New feedback will show as a structured table with slide images and audio.
          </div>
          {renderLegacyFeedback(feedbackData.legacy_text)}
        </div>
      ) : (
        // New structured format
        <div>
          {/* Metadata */}
          <div style={{
            backgroundColor: '#e3f2fd',
            padding: '15px',
            borderRadius: '6px',
            marginBottom: '20px',
            border: '1px solid #90caf9'
          }}>
            <div style={{ fontWeight: 'bold', color: '#1565c0', marginBottom: '5px' }}>
              Session Information
            </div>
            <div style={{ fontSize: '14px', color: '#1976d2' }}>
              📊 {feedbackData.slides.length} slides analyzed • 
              {feedbackData.metadata.has_audio ? ' 🎙️ Audio processed' : ' ⚠️ No audio'} • 
              {feedbackData.metadata.has_conversation ? ' 💬 Q&A included' : ' No Q&A'}
            </div>
          </div>

          {/* Slides Table */}
          {feedbackData.slides.length > 0 ? (
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              border: '1px solid #e9ecef',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                    <th style={{
                      padding: '15px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#495057',
                      width: '200px'
                    }}>
                      Slide
                    </th>
                    <th style={{
                      padding: '15px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#495057'
                    }}>
                      Learning Objectives Feedback
                    </th>
                    <th style={{
                      padding: '15px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color: '#495057',
                      width: '200px'
                    }}>
                      Audio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {feedbackData.slides.map((slideData) => (
                    <SlideRow
                      key={slideData.slide_number}
                      slideData={slideData}
                      onImageClick={handleImageClick}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#fff',
              padding: '40px',
              borderRadius: '8px',
              border: '1px solid #e9ecef',
              textAlign: 'center',
              color: '#666'
            }}>
              No slide feedback available.
            </div>
          )}

          {/* Q&A Feedback */}
          {renderQAFeedback(feedbackData.qa_feedback)}
        </div>
      )}
      
      <div style={{ 
        marginTop: '30px', 
        fontSize: '14px', 
        color: '#666',
        textAlign: 'center',
        padding: '20px',
        backgroundColor: '#fff',
        borderRadius: '6px',
        border: '1px solid #e9ecef'
      }}>
        This feedback was generated based on your pitch presentation and Q&A conversation.
      </div>

      {/* Modal for full-size slide viewing */}
      <SlideModal
        imageUrl={modalImage}
        slideNumber={modalSlideNumber}
        isOpen={isModalOpen}
        onClose={closeModal}
      />
    </div>
  );
}

export default Feedback;