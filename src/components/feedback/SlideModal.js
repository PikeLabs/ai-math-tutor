import { useState, useEffect } from 'react';
import SlideImage from './SlideImage';

function SlideModal({ imageUrl, slideNumber, isOpen, onClose }) {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setImageError(false);
      setIsLoading(true);
      // Add escape key listener
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden'; // Prevent background scrolling

      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen, onClose]);

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setIsLoading(false);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={handleBackdropClick}
    >
      <div style={{
        position: 'relative',
        maxWidth: '90vw',
        maxHeight: '90vh',
        backgroundColor: '#fff',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '15px',
          borderBottom: '1px solid #e0e0e0',
          paddingBottom: '10px'
        }}>
          <h3 style={{ margin: 0, color: '#2c3e50' }}>
            Slide {slideNumber} - Full View
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '0',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#f0f0f0'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* Image Content */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          position: 'relative'
        }}>
          {isLoading && (
            <div style={{
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666'
            }}>
              Loading slide...
            </div>
          )}

          {!imageError ? (
            <SlideImage
              src={imageUrl}
              alt={`Slide ${slideNumber} - Full Size`}
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
                display: isLoading ? 'none' : 'block'
              }}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          ) : (
            <div style={{
              width: '400px',
              height: '300px',
              border: '2px dashed #ccc',
              borderRadius: '4px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              backgroundColor: '#f8f9fa'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>📄</div>
              <div style={{ fontSize: '16px' }}>Slide image not available</div>
              <div style={{ fontSize: '12px', marginTop: '5px' }}>
                The slide image could not be loaded
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '15px',
          padding: '10px 0',
          borderTop: '1px solid #e0e0e0',
          fontSize: '12px',
          color: '#666',
          textAlign: 'center'
        }}>
          Press Esc or click outside to close
        </div>
      </div>
    </div>
  );
}

export default SlideModal;