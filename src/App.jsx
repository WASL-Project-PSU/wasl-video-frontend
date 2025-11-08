import React, { useState, useRef, useEffect } from 'react';
import { Video, Users, LogOut, Loader2 } from 'lucide-react';
import FaceRecognition from './components/FaceRecognition';
import { getPrisonerById } from './lib/api';

export default function WaslVideoCall() {
  const [view, setView] = useState('home');
  const [userName, setUserName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scriptsLoaded, setScriptsLoaded] = useState(false);
  
  // NEW STATE to hold the auth token
  const [authToken, setAuthToken] = useState(null);
  const [prisonerId, setPrisonerId] = useState(null);
  const [prisonerData, setPrisonerData] = useState(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [loadingPrisoner, setLoadingPrisoner] = useState(false);

  const meetingContainerRef = useRef(null);
  const meetingRef = useRef(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3014';

  useEffect(() => {
    const interval = setInterval(() => {
      if (window.DyteClient && window.customElements.get('dyte-meeting')) {
        console.log('Dyte scripts loaded and ready.');
        setScriptsLoaded(true);
        clearInterval(interval);
      }
    }, 100);

    // Check for authToken and prisonerId in URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('authToken');
    const pid = urlParams.get('prisonerId');
    
    if (token) {
      setAuthToken(token);
      if (pid) {
        setPrisonerId(pid);
        setView('faceVerification');
        // Fetch prisoner data
        fetchPrisonerData(pid);
      } else {
      setView('meeting');
      }
    }

    return () => clearInterval(interval);
  }, []);

  const fetchPrisonerData = async (pid) => {
    setLoadingPrisoner(true);
    setError('');
    try {
      const prisoner = await getPrisonerById(pid);
      setPrisonerData(prisoner);
      if (!prisoner.faceDescriptor) {
        setError('Prisoner face not enrolled. Cannot verify identity.');
      }
      setLoadingPrisoner(false);
    } catch (err) {
      console.error('Error fetching prisoner data:', err);
      setError('Failed to load prisoner information. Please try again.');
      setLoadingPrisoner(false);
    }
  };

  const handleFaceVerified = () => {
    setFaceVerified(true);
    setLoadingPrisoner(false);
    // Proceed to meeting after a short delay
    setTimeout(() => {
      setView('meeting');
    }, 1500);
  };

  // *** NEW useEffect to manage the meeting lifecycle ***
  useEffect(() => {
    // This effect runs when we enter the 'meeting' view and have an authToken
    if (view === 'meeting' && authToken) {
      
      const initMeeting = async () => {
        try {
          console.log('=== Starting Meeting Initialization ===');
          console.log('DyteClient available:', !!window.DyteClient);
          
          if (!window.DyteClient) {
            throw new Error('DyteClient not loaded. Please refresh the page.');
          }
          
          // Show loader while initializing
          setLoading(true);

          // We no longer need the setTimeout, React will ensure ref is current
          if (!meetingContainerRef.current) {
            // This might happen on a fast re-render, wait a tick
            await new Promise(resolve => setTimeout(resolve, 0));
            if (!meetingContainerRef.current) {
               throw new Error('Meeting container not found');
            }
          }

          console.log('Calling DyteClient.init...');
          
          const meeting = await window.DyteClient.init({
            authToken,
            uiKit: false,
            defaults: { audio: false, video: false },
            modules: {
              audio: true, video: true, screenShare: true,
              chat: true, polls: true, participants: true
            },
            // Add ICE server configuration
            rtcConfiguration: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
              ],
              iceCandidatePoolSize: 10
            }
          });

          console.log('Meeting object created:', meeting);
          meetingRef.current = meeting;
          setLoading(false);
          // Listen to meeting events
          meeting.self.on('roomJoined', () => {
            console.log('✓✓✓ Room joined successfully ✓✓✓');
            setLoading(false); // Hide loader *after* joining
          });
          
          meeting.self.on('roomLeft', () => console.log('⚠️ Room left'));
          
          meeting.self.on('roomConnectionFailed', (error) => {
            console.error('❌ Room connection failed:', error);
            setError('Failed to connect to meeting room.');
            setLoading(false);
          });
          
          console.log('Creating and adding Dyte UI element...');
          meetingContainerRef.current.innerHTML = ''; // Clear previous UI
          
          const ui = document.createElement('dyte-meeting');
          ui.meeting = meeting;
          ui.showSetupScreen = true;
          
          meetingContainerRef.current.appendChild(ui);
          console.log('✓ UI element added to DOM');
          
        } catch (err) {
          setError('Failed to initialize meeting: ' + err.message);
          console.error('❌ Meeting initialization error:', err);
          setView('home'); // Go back home on error
          setAuthToken(null);
          setLoading(false);
        }
      };
      
      initMeeting();
      
      // *** THIS IS THE CRITICAL CLEANUP FUNCTION ***
      return () => {
        console.log('Running meeting cleanup...');
        if (meetingRef.current) {
          try {
            meetingRef.current.leaveRoom();
            console.log('... room left.');
          } catch (err) {
            console.error('... error leaving room:', err);
          }
          meetingRef.current = null;
        }
        if (meetingContainerRef.current) {
          meetingContainerRef.current.innerHTML = '';
        }
        setAuthToken(null); // Clear the token
        setLoading(false);
      };
    }
  }, [view, authToken]); // Dependencies: This effect re-runs if view or authToken changes

  // *** SIMPLIFIED createMeeting ***
  const createMeeting = async () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/dyte/join-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName, title: 'Wasl Video Call' }),
      });
      const data = await response.json();
      console.log('Create meeting response:', data);

      if (data.success) {
        setMeetingId(data.meetingId);
        setAuthToken(data.authToken); // Set token
        setView('meeting'); // Set view
      } else {
        setError(data.error || 'Failed to create meeting');
      }
    } catch (err) {
      setError('Failed to connect to server. Make sure backend is running.');
      console.error(err);
    }
    // We stop loading *after* the fetch, the useEffect will handle loading for init
    setLoading(false);
  };

  // *** SIMPLIFIED joinMeeting ***
  const joinMeeting = async () => {
    if (!userName.trim() || !meetingId.trim()) {
      setError('Please enter your name and meeting ID');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/dyte/join-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName, meetingId: meetingId }),
      });
      const data = await response.json();
      console.log('Join meeting response:', data);

      if (data.success) {
        setAuthToken(data.authToken); // Set token
        setView('meeting'); // Set view
      } else {
        setError(data.error || 'Failed to join meeting');
      }
    } catch (err) {
      setError('Failed to connect to server. Make sure backend is running.');
      console.error(err);
    }
    setLoading(false);
  };

  // *** SIMPLIFIED leaveMeeting ***
  const leaveMeeting = () => {
    // Just setting the view will trigger the useEffect cleanup
    setView('home');
    setMeetingId('');
    setError('');
    setPrisonerId(null);
    setPrisonerData(null);
    setFaceVerified(false);
  };

  if (view === 'faceVerification') {
    return (
      <div style={styles.mainContainer}>
        <style>{cssStyles}</style>
        <div style={styles.contentWrapper}>
          <div style={styles.header}>
            <div style={styles.iconCircle}>
              <Video style={styles.icon} size={32} />
            </div>
            <h1 style={styles.title}>Face Verification Required</h1>
            <p style={styles.subtitle}>
              {prisonerData 
                ? `Please verify your identity as ${prisonerData.name}`
                : 'Loading prisoner information...'}
            </p>
          </div>

          <div style={styles.card}>
            {loadingPrisoner ? (
              <div style={styles.loadingBox}>
                <Loader2 style={styles.spinner} size={24} />
                <span style={{marginLeft: '12px'}}>Loading prisoner data...</span>
              </div>
            ) : error ? (
              <div style={styles.errorBox}>
                {error}
                <button
                  onClick={() => {
                    setError('');
                    if (prisonerId) fetchPrisonerData(prisonerId);
                  }}
                  style={styles.primaryButton}
                >
                  Retry
                </button>
              </div>
            ) : prisonerData && prisonerData.faceDescriptor ? (
              <div>
                {faceVerified ? (
                  <div style={styles.successBox}>
                    <p style={{color: '#16a34a', fontWeight: 'bold', marginBottom: '16px'}}>
                      ✓ Face verified successfully! Joining meeting...
                    </p>
                    <Loader2 style={styles.spinner} size={24} color="#16a34a" />
                  </div>
                ) : (
                  <div>
                    <FaceRecognition
                      onVerify={handleFaceVerified}
                      prisonerFaceDescriptor={prisonerData.faceDescriptor}
                    />
                    <div style={{marginTop: '16px', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px'}}>
                      <p style={{fontSize: '14px', color: '#1e40af', margin: 0}}>
                        Please position your face clearly in front of the camera for verification.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={styles.errorBox}>
                Prisoner face data not available. Cannot proceed with verification.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === 'meeting') {
    return (
      <div style={styles.meetingView}>
        <style>{cssStyles}</style>
        {/* Show loader while meeting is joining */}
        {loading && (
          <div style={styles.meetingLoader}>
            <Loader2 style={styles.spinner} size={48} color="white" />
            <p style={{color: 'white', marginTop: '16px'}}>Joining room...</p>
          </div>
        )}
        <div style={styles.leaveButtonContainer}>
          <button onClick={leaveMeeting} style={styles.leaveButton} className="leave-btn">
            <LogOut size={20} />
            <span style={styles.buttonText}>Leave Meeting</span>
          </button>
        </div>
        {/* This container will be filled by the useEffect */}
        <div ref={meetingContainerRef} style={styles.meetingContainer} />
      </div>
    );
  }

  // ... (rest of the home/join view JSX is identical, no changes needed)
  return (
    <div style={styles.mainContainer}>
      <style>{cssStyles}</style>
      <div style={styles.contentWrapper}>
        <div style={styles.header}>
          <div style={styles.iconCircle}>
            <Video style={styles.icon} size={32} />
          </div>
          <h1 style={styles.title}>Wasl Video Call</h1>
          <p style={styles.subtitle}>Connect with anyone, anywhere</p>
        </div>

        {!scriptsLoaded && (
          <div style={styles.loadingBox}>
            <Loader2 style={styles.spinner} size={24} />
            <span style={{marginLeft: '12px'}}>Loading video call libraries...</span>
          </div>
        )}

        <div style={styles.card}>
          {view === 'home' && (
            <div style={styles.formContainer}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Your Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  style={styles.input}
                  className="input-field"
                  onKeyPress={(e) => e.key === 'Enter' && createMeeting()}
                  disabled={!scriptsLoaded}
                />
              </div>

              {error && (
                <div style={styles.errorBox}>
                  {error}
                </div>
              )}

              <button
                onClick={createMeeting}
                disabled={loading || !scriptsLoaded}
                style={{...styles.primaryButton, ...(loading || !scriptsLoaded ? styles.disabledButton : {})}}
                className="primary-btn"
              >
                {loading ? (
                  <>
                    <Loader2 style={styles.spinner} size={20} />
                    <span style={styles.buttonText}>Creating Meeting...</span>
                  </>
                ) : (
                  <>
                    <Video size={20} />
                    <span style={styles.buttonText}>Create New Meeting</span>
                  </>
                )}
              </button>

              <div style={styles.dividerContainer}>
                <div style={styles.dividerLine}></div>
                <span style={styles.dividerText}>or</span>
              </div>

              <button
                onClick={() => setView('join')}
                style={styles.secondaryButton}
                className="secondary-btn"
                disabled={!scriptsLoaded}
              >
                <Users size={20} />
                <span style={styles.buttonText}>Join Existing Meeting</span>
              </button>
            </div>
          )}

          {view === 'join' && (
            <div style={styles.formContainer}>
              <button
                onClick={() => {
                  setView('home');
                  setError('');
                }}
                style={styles.backButton}
                className="back-btn"
              >
                ← Back
              </button>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Your Name</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  style={styles.input}
                  className="input-field"
                  disabled={!scriptsLoaded}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Meeting ID</label>
                <input
                  type="text"
                  value={meetingId}
                  onChange={(e) => setMeetingId(e.target.value)}
                  placeholder="Enter meeting ID"
                  style={styles.input}
                  className="input-field"
                  onKeyPress={(e) => e.key === 'Enter' && joinMeeting()}
                  disabled={!scriptsLoaded}
                />
              </div>

              {error && (
                <div style={styles.errorBox}>
                  {error}
                </div>
              )}

              <button
                onClick={joinMeeting}
                disabled={loading || !scriptsLoaded}
                style={{...styles.primaryButton, ...(loading || !scriptsLoaded ? styles.disabledButton : {})}}
                className="primary-btn"
              >
                {loading ? (
                  <>
                    <Loader2 style={styles.spinner} size={20} />
                    <span style={styles.buttonText}>Joining...</span>
                  </>
                ) : (
                  <>
                    <Users size={20} />
                    <span style={styles.buttonText}>Join Meeting</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {meetingId && view === 'home' && (
          <div style={styles.meetingIdBox}>
            <p style={styles.meetingIdLabel}>Share this Meeting ID:</p>
            <p style={styles.meetingIdValue}>{meetingId}</p>
          </div>
        )}

        <p style={styles.footer}>Powered by Dyte</p>
      </div>
    </div>
  );
}

// Add this new style for the in-meeting loader
const styles = {
  meetingLoader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100, // Above the button, below nothing
  },
  meetingView: {
    minHeight: '100vh',
    backgroundColor: '#111827',
    position: 'relative',
  },
  leaveButtonContainer: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    zIndex: 50,
  },
  // ... (rest of the styles are identical, no changes needed)
  leaveButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  meetingContainer: {
    width: '100%',
    height: '100vh',
  },
  mainContainer: {
    minHeight: '100vh',
    background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  contentWrapper: {
    width: '100%',
    maxWidth: '448px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  iconCircle: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '64px',
    height: '64px',
    backgroundColor: '#4f46e5',
    borderRadius: '50%',
    marginBottom: '16px',
  },
  icon: {
    color: 'white',
  },
  title: {
    fontSize: '30px',
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: '8px',
    margin: '0 0 8px 0',
  },
  subtitle: {
    color: '#4b5563',
    margin: 0,
  },
  loadingBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    backgroundColor: '#dbeafe',
    borderRadius: '8px',
    marginBottom: '16px',
    color: '#1e40af',
    fontSize: '14px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    padding: '32px',
  },
  formContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '8px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    outline: 'none',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  errorBox: {
    padding: '12px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#b91c1c',
    borderRadius: '8px',
    fontSize: '14px',
  },
  primaryButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '14px',
  },
  disabledButton: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  secondaryButton: {
    width: '1S00%',
    padding: '12px',
    backgroundColor: 'white',
    color: '#4f46e5',
    border: '2px solid #4f46e5',
    borderRadius: '8px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontSize: '14px',
  },
  dividerContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    margin: '8px 0',
  },
  dividerLine: {
    position: 'absolute',
    width: '100%',
    borderTop: '1px solid #d1d5db',
  },
  dividerText: {
    position: 'relative',
    padding: '0 16px',
    backgroundColor: 'white',
    color: '#6b7280',
    fontSize: '14px',
    margin: '0 auto',
  },
  backButton: {
    fontSize: '14px',
    color: '#4b5563',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 0',
    marginBottom: '8px',
    textAlign: 'left',
  },
  meetingIdBox: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    textAlign: 'center',
  },
  meetingIdLabel: {
    fontSize: '14px',
    color: '#4b5563',
    marginBottom: '4px',
    margin: '0 0 4px 0',
  },
  meetingIdValue: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: '18px',
    color: '#4f46e5',
    margin: 0,
  },
  footer: {
    textAlign: 'center',
    fontSize: '14px',
    color: '#4b5563',
    marginTop: '24px',
  },
  buttonText: {
    marginLeft: '4px',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
  successBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    textAlign: 'center',
  },
};


// CSS Styles (no change)
const cssStyles = `
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .input-field:focus {
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }

  .primary-btn:hover:not(:disabled) {
    background-color: #4338ca;
  }

  .secondary-btn:hover:not(:disabled) {
    background-color: #eef2ff;
  }

  .leave-btn:hover {
    background-color: #b91c1c;
  }

  .back-btn:hover {
    color: #111827;
  }

  input:disabled {
    background-color: #f3f4f6;
    cursor: not-allowed;
}

  button:disabled {
    opacity: 0.6;
  }
`;