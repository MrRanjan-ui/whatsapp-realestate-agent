import React, { useState, useEffect, useRef } from 'react';
import './index.css';

const API_BASE = 'http://localhost:5000';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [leads, setLeads] = useState([]);
  const [properties, setProperties] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [analytics, setAnalytics] = useState({
    totalLeads: 0,
    hotLeads: 0,
    warmLeads: 0,
    coldLeads: 0,
    totalAppointments: 0
  });

  // Selected lead for CRM Chat View
  const [selectedLead, setSelectedLead] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [composerText, setComposerText] = useState('');
  const chatEndRef = useRef(null);

  // Phone Simulator state
  const [simPhone, setSimPhone] = useState('916203025198');
  const [simText, setSimText] = useState('');
  const [simChat, setSimChat] = useState([
    {
      sender: 'bot',
      text: 'Hi, thanks for choosing us, please select what service you need:',
      interactivePayload: {
        type: 'list',
        buttonText: 'Select Services',
        sections: [
          {
            title: 'Real Estate Services',
            rows: [
              { id: 'Buy', title: 'Buy', description: 'Find properties to buy' },
              { id: 'Rent', title: 'Rent', description: 'Find properties to rent' },
              { id: 'Sell', title: 'Sell', description: 'List your property with us' },
              { id: 'Contact Us', title: 'Contact Us', description: 'Talk to our team' }
            ]
          }
        ]
      }
    }
  ]);
  const simChatEndRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    fetchAnalytics();
    fetchLeads();
    fetchProperties();
    fetchAppointments();
  }, []);

  // Poll for message updates if a lead is selected
  useEffect(() => {
    if (!selectedLead) return;
    
    // Fetch chat history immediately
    fetchChat(selectedLead._id);

    const interval = setInterval(() => {
      fetchChat(selectedLead._id);
      fetchLeadsQuietly(); // Refresh list to get updated scores/info
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedLead]);

  // Scroll chat threads to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    simChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simChat]);

  // API fetches
  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analytics`);
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  };

  const fetchLeads = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/leads`);
      const data = await res.json();
      setLeads(data);
      if (data.length > 0 && !selectedLead) {
        setSelectedLead(data[0]);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
  };

  const fetchLeadsQuietly = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/leads`);
      const data = await res.json();
      setLeads(data);
    } catch (err) {
      console.error('Quiet leads fetch err:', err);
    }
  };

  const fetchProperties = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/properties`);
      const data = await res.json();
      setProperties(data);
    } catch (err) {
      console.error('Error fetching properties:', err);
    }
  };

  const fetchAppointments = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/appointments`);
      const data = await res.json();
      setAppointments(data);
    } catch (err) {
      console.error('Error fetching appointments:', err);
    }
  };

  const fetchChat = async (leadId) => {
    try {
      const res = await fetch(`${API_BASE}/api/leads/${leadId}/chat`);
      const data = await res.json();
      setChatMessages(data);
    } catch (err) {
      console.error('Error fetching chat history:', err);
    }
  };

  // Human Takeover Toggle Handler
  const handleTakeoverToggle = async (leadId, currentVal) => {
    try {
      const res = await fetch(`${API_BASE}/api/leads/${leadId}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ takeover: !currentVal })
      });
      const updatedLead = await res.json();
      setSelectedLead(updatedLead);
      fetchLeadsQuietly();
    } catch (err) {
      console.error('Error updating takeover:', err);
    }
  };

  // Manual Agent Message Sender
  const handleSendManual = async (e) => {
    e.preventDefault();
    if (!composerText.trim() || !selectedLead) return;

    const messageToSend = composerText;
    setComposerText('');

    try {
      const res = await fetch(`${API_BASE}/api/leads/${selectedLead._id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: messageToSend })
      });
      const newMsg = await res.json();
      setChatMessages(prev => [...prev, newMsg]);
      // Force takeover UI state sync
      setSelectedLead(prev => ({ ...prev, humanTakeover: true }));
      fetchLeadsQuietly();
    } catch (err) {
      console.error('Error sending manual message:', err);
    }
  };

  // Simulator incoming message submit
  const submitSimulatedChoice = async (choiceText) => {
    // Add user message to simulator screen list
    setSimChat(prev => [...prev, { sender: 'user', text: choiceText }]);

    try {
      const res = await fetch(`${API_BASE}/api/leads/simulate-incoming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: simPhone, text: choiceText })
      });
      
      const data = await res.json();
      
      // If AI responded, display it in phone screen
      if (data.botReplies && data.botReplies.length > 0) {
        setSimChat(prev => [
          ...prev,
          ...data.botReplies.map(r => ({
            sender: 'bot',
            text: r.text,
            imageUrl: r.imageUrl,
            interactivePayload: r.interactivePayload
          }))
        ]);
      } else if (data.botReply) {
        setSimChat(prev => [...prev, { 
          sender: 'bot', 
          text: data.botReply.text, 
          interactivePayload: data.botReply.interactivePayload 
        }]);
      } else {
        let statusReason = "AI reply skipped.";
        if (data.lead.humanTakeover) {
          statusReason = "Takeover Active (AI is muted for this number).";
        } else {
          statusReason = "This number is not in the whitelist (AI auto-replies disabled).";
        }
        setSimChat(prev => [...prev, { sender: 'bot', text: `⚠️ [System Notification]: ${statusReason}` }]);
      }
      
      // Refresh Leads list and Analytics since a new message came in
      fetchLeadsQuietly();
      fetchAnalytics();
      fetchAppointments();
    } catch (err) {
      console.error('Simulator reply fetch err:', err);
    }
  };

  const handleSimSend = async (e) => {
    e.preventDefault();
    if (!simText.trim()) return;

    const userText = simText;
    setSimText('');
    await submitSimulatedChoice(userText);
  };

  const renderInteractivePayload = (msg, isInteractive) => {
    if (!msg.interactivePayload) return null;
    const { type, buttons, sections } = msg.interactivePayload;

    if (type === 'buttons') {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
          {buttons.map((b, idx) => (
            <button
              key={idx}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '20px',
                padding: '6px 14px',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: '600',
                cursor: isInteractive ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
              }}
              onClick={() => isInteractive && submitSimulatedChoice(b.text)}
              disabled={!isInteractive}
              type="button"
            >
              {b.text}
            </button>
          ))}
        </div>
      );
    }

    if (type === 'list') {
      return (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sections.map((sec, sIdx) => (
            <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {sec.title}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {sec.rows.map((row, rIdx) => (
                  <button
                    key={rIdx}
                    style={{
                      background: 'rgba(99, 102, 241, 0.1)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#a5b4fc',
                      fontSize: '12px',
                      textAlign: 'left',
                      cursor: isInteractive ? 'pointer' : 'default',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onClick={() => isInteractive && submitSimulatedChoice(row.title)}
                    disabled={!isInteractive}
                    type="button"
                  >
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{row.title}</div>
                      {row.description && <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{row.description}</div>}
                    </div>
                    {isInteractive && <span style={{ fontSize: '12px' }}>➔</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <div className="sidebar">
        <div className="brand-section">
          <span className="brand-logo">🏡</span>
          <h1 className="brand-name" style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>PrimeEstates AI</h1>
        </div>
        
        <ul className="nav-menu">
          <li className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            📊 Dashboard
          </li>
          <li className={`nav-item ${activeTab === 'leads' ? 'active' : ''}`} onClick={() => setActiveTab('leads')}>
            👤 Leads & CRM
          </li>
          <li className={`nav-item ${activeTab === 'properties' ? 'active' : ''}`} onClick={() => setActiveTab('properties')}>
            🏢 Properties Catalog
          </li>
          <li className={`nav-item ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}>
            📅 Site Visits
          </li>
          <li className={`nav-item ${activeTab === 'simulator' ? 'active' : ''}`} onClick={() => setActiveTab('simulator')}>
            📱 Bot Simulator
          </li>
        </ul>

        <div className="connection-status">
          <span className="status-dot"></span>
          <span>WhatsApp Bot Active</span>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="main-panel">
        <div className="top-bar">
          <div className="panel-title">
            {activeTab === 'dashboard' && 'Market Analytics & Overview'}
            {activeTab === 'leads' && 'Leads Management & Live Chat'}
            {activeTab === 'properties' && 'Property Inventory Catalog'}
            {activeTab === 'appointments' && 'Site Visit Bookings'}
            {activeTab === 'simulator' && 'WhatsApp Bot Interactive Simulator'}
          </div>
          
          <div className="top-actions">
            <span className="api-key-badge">Gemini 1.5 Flash Free Tier Connected</span>
          </div>
        </div>

        {/* Tab 1: Dashboard Analytics */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-content">
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-label">Total Leads</span>
                <span className="stat-value">{analytics.totalLeads}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">🔥 Hot Leads</span>
                <span className="stat-value" style={{color: '#f43f5e'}}>{analytics.hotLeads}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">⚡ Warm Leads</span>
                <span className="stat-value" style={{color: '#f97316'}}>{analytics.warmLeads}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">❄️ Cold Leads</span>
                <span className="stat-value" style={{color: '#38bdf8'}}>{analytics.coldLeads}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Site Visits Scheduled</span>
                <span className="stat-value">{analytics.totalAppointments}</span>
              </div>
            </div>

            {/* Quick Leads List Summary */}
            <div className="appointments-table-container" style={{marginTop: '24px'}}>
              <div className="pane-header">
                <span className="pane-title">Top Qualified Hot Leads</span>
              </div>
              <table className="appointments-table">
                <thead>
                  <tr>
                    <th>Lead Info</th>
                    <th>Phone</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Budget</th>
                    <th>Preferred Location</th>
                    <th>Handoff</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.filter(l => l.status === 'Hot').slice(0, 5).map(lead => (
                    <tr key={lead._id}>
                      <td style={{fontWeight: 600}}>{lead.name || 'Unknown'}</td>
                      <td>+{lead.phone}</td>
                      <td style={{fontWeight: 700, color: '#f43f5e'}}>{lead.leadScore} pts</td>
                      <td><span className="badge hot">HOT</span></td>
                      <td>{lead.budget || 'Not specified'}</td>
                      <td>{lead.locationPreference || 'Not specified'}</td>
                      <td>
                        <span className="badge" style={{background: lead.humanTakeover ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)', color: lead.humanTakeover ? '#10b981' : '#94a3b8'}}>
                          {lead.humanTakeover ? 'Agent' : 'AI'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {leads.filter(l => l.status === 'Hot').length === 0 && (
                    <tr>
                      <td colSpan="7" style={{textAlign: 'center', color: '#64748b'}}>No hot leads qualified yet. Run a chat in the Simulator to test!</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Leads Split View (CRM) */}
        {activeTab === 'leads' && (
          <div className="leads-split-view">
            {/* Leads List Sidebar */}
            <div className="leads-list-pane">
              <div className="pane-header">
                <span className="pane-title">Leads Directory</span>
              </div>
              <div className="leads-list-scroll">
                {leads.map(lead => (
                  <div 
                    key={lead._id} 
                    className={`lead-item-card ${selectedLead?._id === lead._id ? 'selected' : ''}`}
                    onClick={() => setSelectedLead(lead)}
                  >
                    <div className="lead-card-header">
                      <span className="lead-card-name">{lead.name || `Lead +${lead.phone}`}</span>
                      <span className={`badge ${lead.status.toLowerCase()}`}>{lead.status}</span>
                    </div>
                    <span className="lead-card-phone">+{lead.phone} | Score: {lead.leadScore}</span>
                    
                    <div className="lead-card-details">
                      {lead.locationPreference && <span className="detail-pill">📍 {lead.locationPreference}</span>}
                      {lead.budget && <span className="detail-pill">💰 {lead.budget}</span>}
                      {lead.propertyType && <span className="detail-pill">🏠 {lead.propertyType}</span>}
                    </div>
                  </div>
                ))}
                {leads.length === 0 && (
                  <div style={{textAlign: 'center', color: '#64748b', padding: '24px'}}>No leads captured. Use the Phone Simulator tab to populate!</div>
                )}
              </div>
            </div>

            {/* Selected Lead Chat Monitor */}
            <div className="chat-viewer-pane">
              {selectedLead ? (
                <>
                  <div className="chat-viewer-header">
                    <div className="chat-user-info">
                      <span className="chat-user-title">{selectedLead.name || `User +${selectedLead.phone}`}</span>
                      <span style={{fontSize: '12px', color: '#94a3b8'}}>
                        Lead Profile Status: {selectedLead.propertyType || 'Looking'} in {selectedLead.locationPreference || 'NCR'} (Score: {selectedLead.leadScore})
                      </span>
                    </div>
                    <div className="takeover-toggle-container">
                      <span className="takeover-label">Human Handoff Takeover</span>
                      <label className="switch">
                        <input 
                          type="checkbox" 
                          checked={selectedLead.humanTakeover} 
                          onChange={() => handleTakeoverToggle(selectedLead._id, selectedLead.humanTakeover)}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>
                  </div>

                  <div className="chat-messages-scroll">
                    {chatMessages.map(msg => (
                      <div key={msg._id} className={`chat-message-bubble ${msg.sender}`}>
                        <span style={{whiteSpace: 'pre-line'}}>{msg.text}</span>
                        {msg.imageUrl && (
                          <img 
                            src={msg.imageUrl} 
                            alt="Property" 
                            style={{ width: '100%', borderRadius: '12px', marginTop: '8px', maxHeight: '200px', objectFit: 'cover', display: 'block', border: '1px solid rgba(255,255,255,0.1)' }} 
                          />
                        )}
                        {msg.sender === 'bot' && renderInteractivePayload(msg, false)}
                        <span className="msg-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  <form className="chat-composer" onSubmit={handleSendManual}>
                    <input 
                      type="text" 
                      className="composer-input"
                      placeholder={selectedLead.humanTakeover ? "Takeover active. Send a manual reply..." : "Turn on Human Handoff to type manual messages..."}
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      disabled={!selectedLead.humanTakeover}
                    />
                    <button type="submit" className="send-button" disabled={!selectedLead.humanTakeover || !composerText.trim()}>
                      Send
                    </button>
                  </form>
                </>
              ) : (
                <div className="no-lead-selected">
                  <span className="no-lead-icon">💬</span>
                  <span>Select a lead from the directory to review conversation details.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Property Catalog */}
        {activeTab === 'properties' && (
          <div className="dashboard-content">
            <div className="catalog-grid">
              {properties.map(prop => (
                <div key={prop._id} className="property-card">
                  <img src={prop.imageUrl} alt={prop.name} className="property-img" />
                  <div className="property-info">
                    <div className="property-header">
                      <span className="property-title">{prop.name}</span>
                      <span className="property-price">{prop.price}</span>
                    </div>
                    <span className="property-loc">📍 {prop.location} | Config: *{prop.type}*</span>
                    
                    <div className="property-features">
                      {prop.amenities.map((amenity, idx) => (
                        <span key={idx} className="feature-tag">{amenity}</span>
                      ))}
                    </div>

                    <div style={{marginTop: '12px', display: 'flex', gap: '8px', fontSize: '11px', color: '#64748b'}}>
                      <span>RERA: {prop.reraNumber}</span>
                      <span>•</span>
                      <span>Possession: {prop.possessionDate}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Scheduled Site Visits */}
        {activeTab === 'appointments' && (
          <div className="dashboard-content">
            <div className="appointments-table-container">
              <table className="appointments-table">
                <thead>
                  <tr>
                    <th>Lead Name</th>
                    <th>Phone</th>
                    <th>Property Name</th>
                    <th>Site Visit Date</th>
                    <th>Preferred Timeslot</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map(app => (
                    <tr key={app._id}>
                      <td style={{fontWeight: 600}}>{app.leadId?.name || 'Customer'}</td>
                      <td>+{app.leadId?.phone}</td>
                      <td style={{color: '#a5b4fc', fontWeight: 500}}>{app.propertyName}</td>
                      <td>📅 {app.date}</td>
                      <td>⏰ {app.timeSlot}</td>
                      <td>
                        <span className="badge" style={{background: 'rgba(99, 102, 241, 0.1)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.2)'}}>
                          {app.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {appointments.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{textAlign: 'center', color: '#64748b', padding: '32px'}}>No site visits scheduled yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: Bot Simulator */}
        {activeTab === 'simulator' && (
          <div className="simulator-layout">
            {/* Phone Screen Mockup */}
            <div className="phone-mockup">
              <div className="phone-screen">
                <div className="phone-header">
                  <div className="phone-avatar">A</div>
                  <div className="phone-contact-info">
                    <span className="phone-contact-name">Aria (AI Executive)</span>
                    <span className="phone-contact-status">online</span>
                  </div>
                </div>

                <div className="phone-messages">
                  {simChat.map((msg, idx) => (
                    <div key={idx} className={`phone-msg-bubble ${msg.sender}`}>
                      <span style={{whiteSpace: 'pre-line'}}>{msg.text}</span>
                      {msg.imageUrl && (
                        <img 
                          src={msg.imageUrl} 
                          alt="Property" 
                          style={{ width: '100%', borderRadius: '8px', marginTop: '6px', maxHeight: '180px', objectFit: 'cover', display: 'block', border: '1px solid rgba(255,255,255,0.05)' }} 
                        />
                      )}
                      {msg.sender === 'bot' && renderInteractivePayload(msg, idx === simChat.length - 1)}
                    </div>
                  ))}
                  <div ref={simChatEndRef} />
                </div>

                <form className="phone-input-bar" onSubmit={handleSimSend}>
                  <input 
                    type="text" 
                    className="phone-input" 
                    placeholder="Type a WhatsApp message..."
                    value={simText}
                    onChange={(e) => setSimText(e.target.value)}
                  />
                  <button type="submit" className="phone-send-btn">
                    ➤
                  </button>
                </form>
              </div>
            </div>

            {/* Instruction Panel */}
            <div className="simulator-instructions">
              <h2 className="instruction-title">How to Test the AI Agent</h2>
              <p className="instruction-text">
                This simulator bypasses scanning the WhatsApp QR code. It posts directly to the backend simulation endpoint, letting you test the qualification flow.
              </p>

              <div style={{marginBottom: '24px'}}>
                <label style={{display: 'block', fontSize: '13px', marginBottom: '8px', color: 'var(--text-secondary)'}}>
                  Testing Phone Number (Simulated customer number):
                </label>
                <input 
                  type="text" 
                  className="composer-input"
                  style={{maxWidth: '260px', padding: '8px 12px'}}
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                />
              </div>

              <ul className="instruction-steps">
                <li className="instruction-step">
                  <span className="step-num">1</span>
                  <div className="step-desc">
                    Send a greetings message to start: <br/><strong>"Hi, I am looking for a flat."</strong>
                  </div>
                </li>
                <li className="instruction-step">
                  <span className="step-num">2</span>
                  <div className="step-desc">
                    Respond to Aria's questions about your preferred **location** (e.g., *Noida* or *Gurgaon*), **budget** (e.g. *1.5 Cr*), and **timeline** (*immediate*).
                  </div>
                </li>
                <li className="instruction-step">
                  <span className="step-num">3</span>
                  <div className="step-desc">
                    Watch the bot query the seeded inventory, recommend **Green Valley** or **Skyline Residency**, and ask to book a site visit.
                  </div>
                </li>
                <li className="instruction-step">
                  <span className="step-num">4</span>
                  <div className="step-desc">
                    Navigate back to the **Leads & CRM** tab to inspect the lead score, extracted parameters, and toggling human takeover control.
                  </div>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
